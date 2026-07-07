import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPublicHttpUrl,
  extractHtmlTitle,
  htmlToText,
  isPrivateIp,
  parseYouTubeVideoId,
} from "./web-content.ts";

const publicLookup = async () => [{ address: "93.184.216.34" }];
const privateLookup = async () => [{ address: "192.168.1.10" }];

test("private and local ip ranges are detected", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.9.1", "192.168.1.1", "169.254.1.1", "0.0.0.0", "100.64.0.1", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1"]) {
    assert.equal(isPrivateIp(ip), true, `${ip} sollte privat sein`);
  }
  for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111", "172.32.0.1"]) {
    assert.equal(isPrivateIp(ip), false, `${ip} sollte öffentlich sein`);
  }
});

test("assertPublicHttpUrl rejects unsafe urls", async () => {
  await assert.rejects(() => assertPublicHttpUrl("ftp://example.com", publicLookup), /http/);
  await assert.rejects(() => assertPublicHttpUrl("kein-link", publicLookup), /ungültig/);
  await assert.rejects(() => assertPublicHttpUrl("http://localhost/admin", publicLookup), /Lokale/);
  await assert.rejects(() => assertPublicHttpUrl("http://127.0.0.1/x", publicLookup), /Private/);
  await assert.rejects(() => assertPublicHttpUrl("http://example.com:8080/x", publicLookup), /Ports/);
  await assert.rejects(() => assertPublicHttpUrl("http://user:pass@example.com", publicLookup), /Zugangsdaten/);
  // Host, dessen DNS auf eine private Adresse zeigt (SSRF-Klassiker).
  await assert.rejects(() => assertPublicHttpUrl("https://intern.example.com", privateLookup), /Private/);
});

test("assertPublicHttpUrl accepts public hosts", async () => {
  const url = await assertPublicHttpUrl("https://example.com/artikel?x=1", publicLookup);
  assert.equal(url.hostname, "example.com");
});

test("htmlToText strips markup, scripts and entities", () => {
  const html = `<html><head><title>Kopf &amp; Titel</title><style>p{color:red}</style></head>
    <body><script>alert(1)</script><h1>Über&nbsp;uns</h1><p>Erste Zeile.<br>Zweite &quot;Zeile&quot;.</p>
    <!-- Kommentar --><ul><li>Punkt eins</li><li>Punkt zwei</li></ul></body></html>`;

  const text = htmlToText(html);
  assert.ok(!text.includes("alert"));
  assert.ok(!text.includes("color:red"));
  assert.ok(text.includes("Über uns"));
  assert.ok(text.includes('Zweite "Zeile"'));
  assert.ok(text.includes("Punkt eins"));

  assert.equal(extractHtmlTitle(html), "Kopf & Titel");
  assert.equal(extractHtmlTitle("<p>ohne titel</p>"), null);
});

test("youtube urls are recognized in all common forms", () => {
  assert.equal(parseYouTubeVideoId("https://www.youtube.com/watch?v=jNQXAC9IVRw"), "jNQXAC9IVRw");
  assert.equal(parseYouTubeVideoId("https://youtu.be/jNQXAC9IVRw?t=5"), "jNQXAC9IVRw");
  assert.equal(parseYouTubeVideoId("https://m.youtube.com/watch?v=jNQXAC9IVRw"), "jNQXAC9IVRw");
  assert.equal(parseYouTubeVideoId("https://www.youtube.com/shorts/jNQXAC9IVRw"), "jNQXAC9IVRw");
  assert.equal(parseYouTubeVideoId("https://example.com/watch?v=jNQXAC9IVRw"), null);
  assert.equal(parseYouTubeVideoId("https://www.youtube.com/@kanal"), null);
  assert.equal(parseYouTubeVideoId("kein-link"), null);
});
