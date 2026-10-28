import { BadRequestException, Injectable } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { AccessControlService } from '../access-control/access-control.service.js';
import type { AuthenticatedUser } from '../access-control/authenticated-user.js';
import { PERMISSIONS } from '../access-control/permission-catalog.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SUMP_SIZES_LITRES } from '../stock/product-catalog.js';
import {
  normalizePhone,
  parseProduct,
  parseSource,
  parseSumpSize,
  phoneMatchKey,
  VALID_SIZES_TEXT,
  VALID_SOURCES_TEXT,
} from './intake-parsing.js';
import type { LeadSource } from '../generated/prisma/client.js';
import { LeadAssignmentService } from './lead-assignment.service.js';
import { LeadIntakeService } from './lead-intake.service.js';

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Template columns, in order. */
const COLUMNS = ['name', 'phone', 'city', 'product', 'sump size', 'source', 'assigned salesperson', 'notes'] as const;
type Column = 'name' | 'phone' | 'city' | 'product' | 'size' | 'source' | 'salesperson' | 'notes';

/** Header text (lower-cased, letters/digits only) -> column. Accepts a few common spellings. */
const HEADER_ALIASES: Record<string, Column> = {
  // Meta's lead exports use full_name / phone_number; WhatsApp tools often say "WhatsApp number".
  name: 'name', fullname: 'name', customername: 'name', customer: 'name', leadname: 'name', contactname: 'name',
  phone: 'phone', phonenumber: 'phone', mobile: 'phone', mobilenumber: 'phone', mobileno: 'phone', phoneno: 'phone',
  contact: 'phone', contactnumber: 'phone', whatsapp: 'phone', whatsappnumber: 'phone', whatsappno: 'phone',
  city: 'city', town: 'city', location: 'city',
  product: 'product', productinterest: 'product',
  sumpsize: 'size', sumpsizelitres: 'size', size: 'size', sizelitres: 'size', litres: 'size', capacity: 'size',
  source: 'source', leadsource: 'source',
  assignedsalesperson: 'salesperson', salesperson: 'salesperson', assignedto: 'salesperson', owner: 'salesperson',
  notes: 'notes', note: 'notes', remarks: 'notes', comments: 'notes',
};
/** A Meta export with just name and phone is enough; the telecaller qualifies the rest. */
const REQUIRED: Column[] = ['name', 'phone'];

/** Rows the template ships with as examples; refused if uploaded unchanged. */
const EXAMPLE_PREFIX = 'example -';

export interface ImportReport {
  fileName: string;
  totalRows: number;
  created: number;
  createdRows: { row: number; name: string; leadId: string; assignedTo: string | null; autoAssigned: boolean }[];
  duplicates: { row: number; name: string; phone: string; reason: string }[];
  failed: { row: number; name: string; errors: string[] }[];
  ignoredColumns: string[];
  /** New leads per assignee (round-robin and named in the file), most first. */
  assignments: { userId: string; fullName: string; count: number; autoAssigned: number }[];
  /** New leads given out by the round-robin, and those left unassigned (rotation empty). */
  autoAssigned: number;
  unassigned: number;
}

export interface ImportOptions {
  /** Source for rows that don't say (blank or no source column). Defaults to Manual. */
  defaultSource?: LeadSource;
}

@Injectable()
export class LeadImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intake: LeadIntakeService,
    private readonly accessControl: AccessControlService,
    private readonly assignment: LeadAssignmentService,
  ) {}

  // --- Templates ---------------------------------------------------------------

  async template(format: 'csv' | 'xlsx'): Promise<{ body: Buffer; contentType: string; fileName: string }> {
    const examples = [
      // A typical Meta / WhatsApp lead: name and phone only. It goes to the next telecaller.
      ['Example - Ravi Kumar', '9876500001', '', '', '', '', '', ''],
      ['Example - Lakshmi Stores', '9876500002', 'Erode', 'Microbes', '', 'Referral', '', 'Monthly supply'],
    ];
    if (format === 'csv') {
      const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      const csv = [COLUMNS.join(','), ...examples.map((r) => r.map(escape).join(','))].join('\n') + '\n';
      return { body: Buffer.from(csv, 'utf8'), contentType: 'text/csv; charset=utf-8', fileName: 'precon-leads-template.csv' };
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Leads');
    ws.columns = COLUMNS.map((c) => ({ header: c, key: c, width: c === 'notes' ? 40 : c === 'name' ? 28 : 18 }));
    ws.getRow(1).font = { bold: true };
    examples.forEach((r) => ws.addRow(r));
    ws.getColumn(2).numFmt = '@'; // keep phone numbers as text
    // Dropdowns for product / size / source on the first 500 data rows.
    for (let r = 2; r <= 501; r += 1) {
      const row = ws.getRow(r);
      row.getCell(4).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Sump,Microbes"'] };
      row.getCell(5).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${SUMP_SIZES_LITRES.join(',')}"`] };
      row.getCell(6).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Meta,Manual,Website,Referral,Other"'] };
    }

    const help = wb.addWorksheet('How to fill');
    help.getColumn(1).width = 22;
    help.getColumn(2).width = 90;
    [
      ['Column', 'What to enter'],
      ['name *', 'Customer or company name (at least 2 characters).'],
      ['phone *', '10-15 digits; spaces, dashes and +91 are fine. A phone that already exists as a lead is skipped.'],
      ['city', 'Optional.'],
      ['product', 'Optional: Sump or Microbes. Leave blank if not known yet.'],
      ['sump size', `Optional, for Sump only. One of: ${VALID_SIZES_TEXT} (litres).`],
      ['source', `Optional: ${VALID_SOURCES_TEXT}. Blank uses the source chosen on the import screen.`],
      ['assigned salesperson', 'Optional. Leave blank to share leads round-robin across the telecallers. Or enter an email/full name (only admins can name someone other than themselves).'],
      ['notes', 'Optional.'],
      ['', ''],
      ['Before uploading', 'Delete the two "Example - ..." rows on the Leads sheet. Keep the header row.'],
    ].forEach((r, i) => {
      const row = help.addRow(r);
      if (i === 0) row.font = { bold: true };
    });
    const body = Buffer.from(await wb.xlsx.writeBuffer());
    return {
      body,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: 'precon-leads-template.xlsx',
    };
  }

  // --- Import --------------------------------------------------------------------

  async import(
    user: AuthenticatedUser,
    file: { originalname: string; buffer: Buffer; size: number } | undefined,
    options: ImportOptions = {},
  ): Promise<ImportReport> {
    if (!file || file.size === 0) throw new BadRequestException('Choose a .csv or .xlsx file to upload.');
    if (file.size > MAX_IMPORT_BYTES) throw new BadRequestException('That file is larger than 2 MB. Split it into smaller files.');

    const table = await this.readTable(file.originalname, file.buffer);
    const { headerMap, ignoredColumns } = this.mapHeaders(table[0] ?? []);
    const missing = REQUIRED.filter((c) => !Object.values(headerMap).includes(c));
    if (missing.length > 0) {
      throw new BadRequestException(
        `The file's first row must be the column headings. Missing required column(s): ${missing.join(', ')}. ` +
          'Download the template to see the expected columns.',
      );
    }
    const dataRows = table.slice(1).map((cells, i) => ({ rowNumber: i + 2, cells })).filter((r) => r.cells.some((c) => c.trim() !== ''));
    if (dataRows.length === 0) throw new BadRequestException('The file has headings but no lead rows.');
    if (dataRows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`Too many rows (${dataRows.length}). Import at most ${MAX_IMPORT_ROWS} leads per file.`);
    }

    const canAssign = user.permissions.includes(PERMISSIONS.LEADS_ASSIGN);
    const assignees = canAssign ? await this.accessControl.activeUsersWithAnyTag([PERMISSIONS.LEADS_READ]) : [];
    const assigneeEmails = canAssign
      ? new Map(
          (await this.prisma.user.findMany({ where: { id: { in: assignees.map((a) => a.id) } }, select: { id: true, email: true } })).map(
            (u) => [u.email.toLowerCase(), u.id],
          ),
        )
      : new Map<string, string>();
    // Read the rotation once; each blank-assignee row then takes the next turn.
    const rotation = await this.assignment.rotationIds();
    const defaultSource = options.defaultSource ?? 'MANUAL';

    const report: ImportReport = {
      fileName: file.originalname,
      totalRows: dataRows.length,
      created: 0,
      createdRows: [],
      duplicates: [],
      failed: [],
      ignoredColumns,
      assignments: [],
      autoAssigned: 0,
      unassigned: 0,
    };
    const perAssignee = new Map<string, { userId: string; fullName: string; count: number; autoAssigned: number }>();
    const seenInFile = new Map<string, number>(); // phone key -> first row number

    for (const { rowNumber, cells } of dataRows) {
      const get = (col: Column) => {
        const idx = Object.entries(headerMap).find(([, c]) => c === col)?.[0];
        return idx === undefined ? '' : (cells[Number(idx)] ?? '').trim();
      };
      const name = get('name');
      const errors: string[] = [];

      if (name.toLowerCase().startsWith(EXAMPLE_PREFIX)) {
        report.failed.push({ row: rowNumber, name, errors: ["This is the template's example row; delete it before uploading"] });
        continue;
      }
      if (name.length < 2) errors.push('Name is missing or too short');
      if (name.length > 120) errors.push('Name is longer than 120 characters');

      const phone = normalizePhone(get('phone'));
      if (!phone) errors.push(`Phone "${get('phone')}" must be 10-15 digits`);

      const size = parseSumpSize(get('size'));
      if (size === null) errors.push(`Sump size "${get('size')}" must be one of ${VALID_SIZES_TEXT} litres`);

      // Blank = not known yet; a sump size on its own means a sump.
      const product = get('product') ? parseProduct(get('product')) : size ? 'SUMP' : null;
      if (get('product') && !product) errors.push(`Product "${get('product')}" must be Sump or Microbes (or blank)`);
      if (product === 'MICROBES' && size) errors.push('Microbes have no size; leave sump size empty');

      const source = parseSource(get('source'), defaultSource);
      if (!source) errors.push(`Source "${get('source')}" must be ${VALID_SOURCES_TEXT}`);

      // Blank = round-robin. Naming someone follows the same rule as assigning by hand.
      let assignedToId: string | null = null;
      const who = get('salesperson');
      if (who) {
        const byEmail = assigneeEmails.get(who.toLowerCase());
        const byName = assignees.find((a) => a.fullName.toLowerCase() === who.toLowerCase())?.id;
        const isSelf = who.toLowerCase() === user.email.toLowerCase() || who.toLowerCase() === user.fullName.toLowerCase();
        if (!canAssign && !isSelf) errors.push(`You can't assign leads to someone else ("${who}"); leave it empty`);
        else if (canAssign && !(byEmail ?? byName)) errors.push(`Salesperson "${who}" not found (use their email or full name)`);
        else assignedToId = canAssign ? (byEmail ?? byName ?? null) : user.id;
      }

      const notes = get('notes');
      if (notes.length > 5000) errors.push('Notes are longer than 5000 characters');
      const city = get('city');

      if (errors.length > 0 || !phone || !source) {
        report.failed.push({ row: rowNumber, name, errors });
        continue;
      }

      const key = phoneMatchKey(phone);
      const earlier = seenInFile.get(key);
      if (earlier) {
        report.duplicates.push({ row: rowNumber, name, phone, reason: `Same phone as row ${earlier} in this file` });
        continue;
      }
      seenInFile.set(key, rowNumber);

      const result = await this.intake.create({
        name,
        phone,
        city: city || null,
        source,
        productInterest: product,
        sumpSizeLitres: size ?? null,
        notes: notes || null,
        assignedToId,
        rotation,
        createdById: user.id,
        sourceDetail: `Import: ${file.originalname}`,
      });
      if (result.status === 'created') {
        report.created += 1;
        report.createdRows.push({
          row: rowNumber,
          name,
          leadId: result.leadId,
          assignedTo: result.assignedTo?.fullName ?? null,
          autoAssigned: result.autoAssigned,
        });
        if (result.autoAssigned) report.autoAssigned += 1;
        if (result.assignedTo) {
          const tally = perAssignee.get(result.assignedTo.id) ?? { userId: result.assignedTo.id, fullName: result.assignedTo.fullName, count: 0, autoAssigned: 0 };
          tally.count += 1;
          if (result.autoAssigned) tally.autoAssigned += 1;
          perAssignee.set(result.assignedTo.id, tally);
        } else {
          report.unassigned += 1;
        }
      } else {
        report.duplicates.push({ row: rowNumber, name, phone, reason: `Phone already exists (lead "${result.existingName}")` });
      }
    }
    report.assignments = [...perAssignee.values()].sort((a, b) => b.count - a.count || a.fullName.localeCompare(b.fullName));
    return report;
  }

  /** The file as rows of trimmed strings. Throws a friendly error for anything that isn't a readable CSV/XLSX. */
  private async readTable(fileName: string, buffer: Buffer): Promise<string[][]> {
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext === 'csv') {
      try {
        const text = decodeCsv(buffer);
        const firstLine = text.slice(0, text.search(/\r?\n|$/));
        // Meta's "Download leads" CSV is tab-separated; some Excel locales use semicolons.
        const delimiter = ['\t', ';', ','].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',');
        const rows = parseCsv(text, { delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: true, trim: true }) as string[][];
        return rows.map((r) => r.map((c) => String(c ?? '')));
      } catch (error) {
        throw new BadRequestException(`Couldn't read that CSV file: ${(error as Error).message}`);
      }
    }
    if (ext === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      } catch {
        throw new BadRequestException("Couldn't read that Excel file. Save it as .xlsx (Excel Workbook) and try again.");
      }
      const ws = wb.worksheets.find((w) => w.name.toLowerCase() === 'leads') ?? wb.worksheets[0];
      if (!ws) throw new BadRequestException('That Excel file has no sheets.');
      const rows: string[][] = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = [];
        for (let c = 1; c <= Math.max(row.cellCount, COLUMNS.length); c += 1) cells.push(cellText(row.getCell(c).value));
        rows.push(cells);
      });
      return rows;
    }
    if (ext === 'xls') throw new BadRequestException('Old .xls files are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx).');
    throw new BadRequestException('Unsupported file type. Upload a .csv or .xlsx file (download the template to start).');
  }

  private mapHeaders(header: string[]) {
    const headerMap: Record<number, Column> = {};
    const ignoredColumns: string[] = [];
    header.forEach((h, i) => {
      const key = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      const col = HEADER_ALIASES[key];
      if (col && !Object.values(headerMap).includes(col)) headerMap[i] = col;
      else if (h.trim()) ignoredColumns.push(h.trim());
    });
    return { headerMap, ignoredColumns };
  }
}

/** CSV bytes as text: UTF-16 (what Meta's lead download uses) or UTF-8, without a byte-order mark. */
function decodeCsv(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** An Excel cell value as plain text (numbers without scientific notation, rich text joined). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((t) => t.text).join('').trim();
    if ('text' in value && typeof value.text === 'string') return value.text.trim(); // hyperlink
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue); // formula
  }
  return typeof value === 'boolean' ? String(value) : '';
}
