import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_TABS, appRole, badge, TAB_SETS, tabLabel, tabVisible } from './tabs.ts';

test('telecallers get call-focused tabs, sales get pipeline and field tabs', () => {
  assert.deepEqual(TAB_SETS.telecaller, ['index', 'my-leads', 'callbacks', 'schedule', 'more']);
  assert.deepEqual(TAB_SETS.sales, ['index', 'my-leads', 'pipeline', 'visits', 'more']);
  assert.ok(!tabVisible('telecaller', 'visits'));
  assert.ok(!tabVisible('sales', 'callbacks'));
});

test('every role has Home first and More last, five tabs at most, all real routes', () => {
  for (const tabs of Object.values(TAB_SETS)) {
    assert.equal(tabs[0], 'index');
    assert.equal(tabs.at(-1), 'more');
    assert.ok(tabs.length <= 5);
    for (const t of tabs) assert.ok(ALL_TABS.includes(t));
  }
});

test('admins get the full CRM: dashboard, all leads, follow-ups, site visits, More', () => {
  assert.equal(appRole('admin'), 'admin');
  assert.deepEqual(TAB_SETS.admin, ['index', 'my-leads', 'callbacks', 'visits', 'more']);
  assert.equal(tabLabel('admin', 'my-leads'), 'Leads');
  assert.equal(tabLabel('admin', 'callbacks'), 'Follow-ups');
  assert.equal(tabLabel('telecaller', 'callbacks'), 'Callbacks');
  assert.equal(tabLabel('sales', 'my-leads'), 'My Leads');
});

test('unknown roles fall back to Home and More', () => {
  assert.equal(appRole('telecaller'), 'telecaller');
  assert.equal(appRole('sales'), 'sales');
  assert.deepEqual(TAB_SETS[appRole('factory_supervisor')], ['index', 'more']);
});

test('badges hide at zero and cap at 99+', () => {
  assert.equal(badge(0), undefined);
  assert.equal(badge(null), undefined);
  assert.equal(badge(7), 7);
  assert.equal(badge(140), '99+');
});
