package expo.modules.calllog

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads the phone's call log for the numbers it is given, and nothing else.
 *
 * Privacy: only entries newer than sinceMs are looked at, only the columns below
 * are requested, and a row whose number isn't in numberKeys is dropped here, so
 * it never reaches the app's JavaScript or the network.
 *
 * Never throws for a missing permission or an unreadable log: it returns nothing.
 */
class CallLogModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PreconCallLog")

    AsyncFunction("readMatching") { sinceMs: Double, numberKeys: List<String>, limit: Int ->
      val context = appContext.reactContext
      if (context == null || numberKeys.isEmpty() || !hasPermission(context)) {
        return@AsyncFunction nothing()
      }
      try {
        read(context, sinceMs.toLong(), numberKeys.toHashSet(), limit)
      } catch (_: SecurityException) {
        nothing() // permission withdrawn between the check and the read
      } catch (_: IllegalArgumentException) {
        nothing() // a phone maker's call log without a standard column
      }
    }
  }

  private fun nothing(): Map<String, Any> = mapOf("calls" to emptyList<Map<String, Any>>(), "truncated" to false)

  private fun hasPermission(context: Context) =
    context.checkSelfPermission(Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED

  private fun read(context: Context, sinceMs: Long, wanted: Set<String>, limit: Int): Map<String, Any> {
    val calls = ArrayList<Map<String, Any>>()
    var truncated = false
    context.contentResolver.query(
      CallLog.Calls.CONTENT_URI,
      arrayOf(CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION),
      "${CallLog.Calls.DATE} > ?",
      arrayOf(sinceMs.toString()),
      "${CallLog.Calls.DATE} ASC"
    )?.use { row ->
      val id = row.getColumnIndexOrThrow(CallLog.Calls._ID)
      val number = row.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
      val type = row.getColumnIndexOrThrow(CallLog.Calls.TYPE)
      val date = row.getColumnIndexOrThrow(CallLog.Calls.DATE)
      val duration = row.getColumnIndexOrThrow(CallLog.Calls.DURATION)

      while (row.moveToNext()) {
        val phone = row.getString(number) ?: continue
        if (key(phone) !in wanted) continue
        val direction = direction(row.getInt(type)) ?: continue
        if (calls.size >= limit) {
          truncated = true
          break
        }
        calls.add(
          mapOf(
            "id" to row.getLong(id).toString(),
            "number" to phone,
            "direction" to direction,
            "startedAtMs" to row.getLong(date).toDouble(),
            "durationSeconds" to row.getLong(duration).toDouble()
          )
        )
      }
    }
    return mapOf("calls" to calls, "truncated" to truncated)
  }

  /** Same rule as phoneKey in src/lib/call-sync.ts: the last 10 digits. */
  private fun key(phone: String) = phone.filter { it.isDigit() }.takeLast(10)

  private fun direction(type: Int): String? = when (type) {
    CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
    CallLog.Calls.INCOMING_TYPE -> "INCOMING"
    CallLog.Calls.MISSED_TYPE -> "MISSED"
    CallLog.Calls.REJECTED_TYPE -> "REJECTED"
    else -> null // voicemail, blocked and answered-elsewhere aren't work calls
  }
}
