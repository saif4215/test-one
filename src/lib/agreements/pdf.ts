/**
 * PDF generation with pdf-lib. Renders the document model (the same one the
 * preview uses), stamps page numbers, ids and a DRAFT mark, and appends
 * attached PDFs and images as numbered exhibits. Uses the built-in PDF fonts,
 * so text is limited to Western European characters; anything else is
 * replaced with "?" rather than silently dropped.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { BuiltDocument, Block } from "./document";

export interface SignaturePlacement {
  party: "buyer" | "seller";
  page: number; // 1-based
  /** Points from the left edge and from the TOP of the page (DocuSign-style coordinates). */
  signX: number;
  signTop: number;
  dateX: number;
  dateTop: number;
}

export interface ExhibitFile {
  id: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
}

export interface GeneratedPdf {
  bytes: Uint8Array;
  pageCount: number;
  agreementPageCount: number;
  placements: SignaturePlacement[];
  /** Exhibits that could not be merged (reason per file). */
  mergeFailures: Array<{ fileName: string; reason: string }>;
}

const PAGE_W = 612;
const PAGE_H = 792;
const M = 56;
const CONTENT_W = PAGE_W - M * 2;
const BODY = 10.5;

const REPLACEMENTS: Record<string, string> = {
  "‑": "-", "‐": "-", "−": "-", "→": "->", "✓": "x", "✔": "x", " ": " ", "​": "", " ": " ", " ": " ",
};

function clean(font: PDFFont, s: string): string {
  const set = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const mapped = REPLACEMENTS[ch] ?? ch;
    for (const c of mapped) out += c === "\t" ? "  " : set.has(c.codePointAt(0)!) || c === "\n" ? c : "?";
  }
  return out;
}

class Writer {
  pdf: PDFDocument;
  page!: PDFPage;
  y = 0;
  pageNo = 0;
  placements: SignaturePlacement[] = [];
  constructor(pdf: PDFDocument, public regular: PDFFont, public bold: PDFFont, public italic: PDFFont, public sans: PDFFont, public sansBold: PDFFont) {
    this.pdf = pdf;
    this.newPage();
  }
  newPage() {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.pageNo += 1;
    this.y = PAGE_H - M - 14; // leave room for the running header
  }
  ensure(h: number) {
    if (this.y - h < M + 14) this.newPage();
  }
  wrap(font: PDFFont, text: string, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const para of clean(font, text).split("\n")) {
      if (!para.trim()) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const word of para.split(/ +/)) {
        const attempt = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(attempt, size) <= width) line = attempt;
        else {
          if (line) lines.push(line);
          // Break a single very long token (e.g. a hash or URL).
          let rest = word;
          while (font.widthOfTextAtSize(rest, size) > width) {
            let n = rest.length;
            while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
            lines.push(rest.slice(0, n));
            rest = rest.slice(n);
          }
          line = rest;
        }
      }
      lines.push(line);
    }
    return lines;
  }
  text(s: string, x: number, y: number, size: number, font: PDFFont, color = rgb(0.1, 0.1, 0.1)) {
    this.page.drawText(clean(font, s), { x, y, size, font, color });
  }
  paragraph(text: string, opts: { font?: PDFFont; size?: number; indent?: number; num?: string; gap?: number; width?: number; color?: ReturnType<typeof rgb> } = {}) {
    const font = opts.font ?? this.regular;
    const size = opts.size ?? BODY;
    const indent = opts.indent ?? 0;
    const numW = opts.num ? 34 : 0;
    const width = (opts.width ?? CONTENT_W) - indent - numW;
    const lines = this.wrap(font, text, size, width);
    const lead = size * 1.36;
    lines.forEach((ln, i) => {
      this.ensure(lead);
      if (i === 0 && opts.num) this.text(opts.num, M + indent, this.y - size, size, this.bold);
      if (ln) this.text(ln, M + indent + numW, this.y - size, size, font, opts.color);
      this.y -= lead;
    });
    this.y -= opts.gap ?? 5;
  }
}

function drawBox(w: Writer, text: string, tone: "warn" | "info") {
  const pad = 8;
  const size = 9.5;
  const lines = w.wrap(w.sans, text, size, CONTENT_W - pad * 2);
  const h = lines.length * size * 1.36 + pad * 2;
  w.ensure(h);
  w.page.drawRectangle({
    x: M, y: w.y - h, width: CONTENT_W, height: h,
    color: tone === "warn" ? rgb(1, 0.96, 0.88) : rgb(0.92, 0.95, 0.99),
    borderColor: tone === "warn" ? rgb(0.85, 0.6, 0.2) : rgb(0.6, 0.7, 0.85),
    borderWidth: 0.7,
  });
  lines.forEach((ln, i) => w.text(ln, M + pad, w.y - pad - size - i * size * 1.36, size, w.sans));
  w.y -= h + 8;
}

function drawTable(w: Writer, head: string[], rows: string[][], widths?: number[], align?: Array<"l" | "r">) {
  const size = 8.6;
  const lead = size * 1.32;
  const pad = 4;
  const fr = widths && widths.length === head.length ? widths : head.map(() => 1 / head.length);
  const cols = fr.map((f) => f * CONTENT_W);
  const cellLines = (cells: string[], font: PDFFont) => cells.map((c, i) => w.wrap(font, c, size, cols[i] - pad * 2));
  const drawRow = (cells: string[], bold: boolean, shade: boolean) => {
    const font = bold ? w.sansBold : w.sans;
    const lines = cellLines(cells, font);
    const h = Math.max(...lines.map((l) => l.length), 1) * lead + pad * 2;
    if (w.y - h < M + 14) {
      w.newPage();
      if (!bold) drawRow(head, true, true); // repeat header on the new page
    }
    if (shade) w.page.drawRectangle({ x: M, y: w.y - h, width: CONTENT_W, height: h, color: rgb(0.94, 0.95, 0.97) });
    let x = M;
    lines.forEach((ls, i) => {
      ls.forEach((ln, j) => {
        const tw = font.widthOfTextAtSize(ln, size);
        const tx = align?.[i] === "r" ? x + cols[i] - pad - tw : x + pad;
        if (ln) w.text(ln, tx, w.y - pad - size - j * lead + 1, size, font);
      });
      x += cols[i];
    });
    w.page.drawLine({ start: { x: M, y: w.y - h }, end: { x: M + CONTENT_W, y: w.y - h }, thickness: 0.4, color: rgb(0.75, 0.77, 0.8) });
    w.y -= h;
  };
  w.ensure(40);
  w.page.drawLine({ start: { x: M, y: w.y }, end: { x: M + CONTENT_W, y: w.y }, thickness: 0.8, color: rgb(0.4, 0.43, 0.47) });
  drawRow(head, true, true);
  rows.forEach((r) => drawRow(r, false, false));
  w.y -= 10;
}

function drawSignature(w: Writer, b: Extract<Block, { t: "sig" }>) {
  const label = b.party === "buyer" ? "BUYER" : "SELLER";
  const h = 168;
  w.ensure(h);
  const top = w.y;
  w.page.drawRectangle({ x: M, y: top - h, width: CONTENT_W, height: h, borderColor: rgb(0.7, 0.72, 0.75), borderWidth: 0.6 });
  w.text(label, M + 10, top - 20, 11, w.sansBold);
  const row = (k: string, v: string, yy: number) => {
    w.text(k, M + 10, yy, 8.5, w.sans, rgb(0.35, 0.37, 0.4));
    w.text(v || "________________________", M + 190, yy, 9.5, w.sans);
  };
  row("Printed legal name", b.printedName, top - 40);
  row("Entity name (if applicable)", b.entity, top - 56);
  row("Authorized representative", b.rep, top - 72);
  row("Title", b.title, top - 88);
  const lineY = top - 128;
  w.text("Signature", M + 10, lineY - 12, 8.5, w.sans, rgb(0.35, 0.37, 0.4));
  w.page.drawLine({ start: { x: M + 10, y: lineY }, end: { x: M + 250, y: lineY }, thickness: 0.7, color: rgb(0, 0, 0) });
  w.text("Date and time of electronic signature", M + 280, lineY - 12, 8.5, w.sans, rgb(0.35, 0.37, 0.4));
  w.page.drawLine({ start: { x: M + 280, y: lineY }, end: { x: M + CONTENT_W - 10, y: lineY }, thickness: 0.7, color: rgb(0, 0, 0) });
  w.text("Completed by the electronic signature service. Not pre-filled.", M + 10, top - h + 8, 7.5, w.italic, rgb(0.45, 0.47, 0.5));
  w.placements.push({
    party: b.party,
    page: w.pageNo,
    signX: M + 12,
    signTop: PAGE_H - lineY - 24,
    dateX: M + 282,
    dateTop: PAGE_H - lineY - 18,
  });
  w.y -= h + 12;
}

function drawBlankBlock(w: Writer, title: string, lines: string[]) {
  const h = 22 + lines.length * 24;
  w.ensure(h);
  w.page.drawRectangle({ x: M, y: w.y - h, width: CONTENT_W, height: h, borderColor: rgb(0.7, 0.72, 0.75), borderWidth: 0.6 });
  w.text(title, M + 10, w.y - 16, 9.5, w.sansBold);
  lines.forEach((l, i) => {
    const yy = w.y - 40 - i * 24;
    w.text(l, M + 10, yy + 2, 8.5, w.sans, rgb(0.35, 0.37, 0.4));
    w.page.drawLine({ start: { x: M + 150, y: yy }, end: { x: M + CONTENT_W - 10, y: yy }, thickness: 0.5, color: rgb(0, 0, 0) });
  });
  w.y -= h + 10;
}

export async function generateAgreementPdf(doc: BuiltDocument, exhibitFiles: ExhibitFile[] = []): Promise<GeneratedPdf> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.title} (${doc.agreementId}, version ${doc.versionNo})${doc.draft ? " - DRAFT" : ""}`);
  pdf.setProducer("Maruf Cafe agreement module");
  pdf.setCreator("Maruf Cafe agreement module");
  const [regular, bold, italic, sans, sansBold] = await Promise.all([
    pdf.embedFont(StandardFonts.TimesRoman),
    pdf.embedFont(StandardFonts.TimesRomanBold),
    pdf.embedFont(StandardFonts.TimesRomanItalic),
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  const w = new Writer(pdf, regular, bold, italic, sans, sansBold);

  for (const b of doc.blocks) {
    switch (b.t) {
      case "title": {
        w.y -= 30;
        for (const [text, size] of [[b.text, 26], [b.sub ?? "", 15]] as const) {
          if (!text) continue;
          const tw = bold.widthOfTextAtSize(clean(bold, text), size);
          w.ensure(size + 10);
          w.text(text, (PAGE_W - tw) / 2, w.y - size, size, bold);
          w.y -= size + 12;
        }
        w.y -= 14;
        break;
      }
      case "banner":
        drawBox(w, b.text, b.tone);
        break;
      case "h1": {
        w.ensure(60);
        w.y -= 10;
        w.paragraph(b.text, { font: w.sansBold, size: 12.5, gap: 2 });
        w.page.drawLine({ start: { x: M, y: w.y + 1 }, end: { x: M + CONTENT_W, y: w.y + 1 }, thickness: 0.8, color: rgb(0.3, 0.33, 0.38) });
        w.y -= 8;
        break;
      }
      case "h2":
        w.ensure(40);
        w.paragraph(b.text, { font: w.sansBold, size: 10.5, gap: 3 });
        break;
      case "p":
        w.paragraph(b.text, { num: b.num });
        break;
      case "list":
        for (const it of b.items) w.paragraph(`•  ${it}`, { indent: 14, gap: 3 });
        w.y -= 3;
        break;
      case "kv":
        drawTable(w, ["Item", "Detail"], b.rows, [0.32, 0.68]);
        break;
      case "table":
        drawTable(w, b.head, b.rows, b.widths, b.align);
        break;
      case "sig":
        drawSignature(w, b);
        break;
      case "witness":
        drawBlankBlock(w, "WITNESS (optional)", ["Witness printed name", "Witness signature", "Date"]);
        break;
      case "notary":
        drawBlankBlock(w, "NOTARIAL ACKNOWLEDGMENT (optional, completed only by a notary public)", ["Notary printed name", "Notary signature and seal", "Commission expiration", "Date"]);
        break;
      case "pagebreak":
        if (w.y < PAGE_H - M - 30) w.newPage();
        break;
    }
  }
  const agreementPageCount = pdf.getPageCount();

  /* ---- exhibits ---- */
  const mergeFailures: GeneratedPdf["mergeFailures"] = [];
  for (const ex of doc.exhibits) {
    if (!ex.mergeable) continue;
    const file = exhibitFiles.find((f) => f.id === ex.id);
    const sep = pdf.addPage([PAGE_W, PAGE_H]);
    const cover = (lines: string[]) => {
      let yy = PAGE_H / 2 + 40;
      lines.forEach((ln, i) => {
        const size = i === 0 ? 22 : 11;
        const font = i === 0 ? bold : sans;
        const t = clean(font, ln);
        sep.drawText(t, { x: (PAGE_W - font.widthOfTextAtSize(t, size)) / 2, y: yy, size, font });
        yy -= size + 12;
      });
    };
    if (!file) {
      cover([ex.label, ex.fileName, "This file could not be found and is not included."]);
      mergeFailures.push({ fileName: ex.fileName, reason: "file not found" });
      continue;
    }
    cover([ex.label, ex.fileName, ex.schedule ? `Referenced as part of Schedule ${ex.schedule}` : "Supporting document", `SHA-256: ${ex.sha256}`]);
    try {
      if (ex.contentType === "application/pdf") {
        const src = await PDFDocument.load(file.bytes, { ignoreEncryption: false, updateMetadata: false });
        const pages = await pdf.copyPages(src, src.getPageIndices());
        pages.forEach((p) => pdf.addPage(p));
      } else {
        const img = ex.contentType === "image/png" ? await pdf.embedPng(file.bytes) : await pdf.embedJpg(file.bytes);
        const scale = Math.min((PAGE_W - 2 * M) / img.width, (PAGE_H - 2 * M - 20) / img.height, 1);
        const p = pdf.addPage([PAGE_W, PAGE_H]);
        p.drawImage(img, { x: (PAGE_W - img.width * scale) / 2, y: PAGE_H - M - 10 - img.height * scale, width: img.width * scale, height: img.height * scale });
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : "unreadable file";
      mergeFailures.push({ fileName: ex.fileName, reason });
      const p = pdf.addPage([PAGE_W, PAGE_H]);
      p.drawText(clean(sans, `${ex.label} could not be merged: ${reason}`).slice(0, 110), { x: M, y: PAGE_H / 2, size: 11, font: sans });
    }
  }

  /* ---- running header/footer and DRAFT mark on every page ---- */
  const total = pdf.getPageCount();
  pdf.getPages().forEach((p, i) => {
    const gray = rgb(0.4, 0.42, 0.45);
    if (i < agreementPageCount && i > 0) {
      p.drawText(clean(sans, "Maruf Cafe — Business Purchase and Sale Agreement"), { x: M, y: PAGE_H - 36, size: 8, font: sans, color: gray });
      const right = clean(sans, `${doc.agreementId} · Version ${doc.versionNo}${doc.draft ? " · DRAFT" : ""}`);
      p.drawText(right, { x: PAGE_W - M - sans.widthOfTextAtSize(right, 8), y: PAGE_H - 36, size: 8, font: sans, color: doc.draft ? rgb(0.75, 0.3, 0.1) : gray });
    }
    const foot = clean(sans, `${doc.agreementId} · Version ${doc.versionNo}${doc.draft ? " · DRAFT — NOT SIGNED" : ""}`);
    p.drawText(foot, { x: M, y: 24, size: 7.5, font: sans, color: gray });
    const pg = `Page ${i + 1} of ${total}`;
    p.drawText(pg, { x: PAGE_W - M - sans.widthOfTextAtSize(pg, 7.5), y: 24, size: 7.5, font: sans, color: gray });
    if (doc.draft) {
      p.drawText("DRAFT", { x: 120, y: 250, size: 120, font: sansBold, color: rgb(0.8, 0.2, 0.1), opacity: 0.09, rotate: degrees(40) });
    }
  });

  const bytes = await pdf.save();
  return { bytes, pageCount: total, agreementPageCount, placements: w.placements, mergeFailures };
}
