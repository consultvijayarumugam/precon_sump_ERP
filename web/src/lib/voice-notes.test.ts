import assert from "node:assert/strict";
import { test } from "node:test";
import { fileNameFor, formatDuration, micErrorMessage, pickRecorderMime, secondsLeft } from "./voice-notes.ts";

test("durations read as m:ss", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(42_000), "0:42");
  assert.equal(formatDuration(65_400), "1:05");
  assert.equal(formatDuration(120_000), "2:00");
});

test("records in a format every player can use: MP4/AAC first, then WebM/Opus", () => {
  assert.equal(pickRecorderMime((t) => t.startsWith("audio/mp4")), "audio/mp4;codecs=mp4a.40.2");
  assert.equal(pickRecorderMime((t) => t.startsWith("audio/webm")), "audio/webm;codecs=opus");
  assert.equal(pickRecorderMime(() => false), null);
  assert.equal(
    pickRecorderMime((t) => {
      if (t.includes("mp4")) throw new Error("unknown");
      return t === "audio/webm";
    }),
    "audio/webm",
  );
});

test("the upload's file name matches the format", () => {
  assert.equal(fileNameFor("audio/mp4;codecs=mp4a.40.2"), "voice-note.m4a");
  assert.equal(fileNameFor("audio/webm;codecs=opus"), "voice-note.webm");
  assert.equal(fileNameFor("audio/ogg"), "voice-note.ogg");
});

test("a refused or missing microphone gets a plain message that points to typed notes", () => {
  assert.match(micErrorMessage({ name: "NotAllowedError" }), /blocked.*type a note/);
  assert.match(micErrorMessage({ name: "NotFoundError" }), /No microphone/);
  assert.match(micErrorMessage({ name: "NotReadableError" }), /busy/);
  assert.match(micErrorMessage({ name: "Unsupported" }), /can't record/);
  assert.match(micErrorMessage("weird"), /type a note instead/);
});

test("the countdown near the 2-minute cap", () => {
  assert.equal(secondsLeft(0), 120);
  assert.equal(secondsLeft(105_200), 15);
  assert.equal(secondsLeft(130_000), 0);
});
