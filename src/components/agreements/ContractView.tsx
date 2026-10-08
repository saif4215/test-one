import type { Block, BuiltDocument } from "@/lib/agreements/document";

/** Highlights unfinished "[TO BE COMPLETED: …]" markers so nobody overlooks them. */
function Text({ s }: { s: string }) {
  const parts = s.split(/(\[TO BE COMPLETED[^\]]*\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("[TO BE COMPLETED") ? (
          <mark key={i} className="tbc">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "title":
      return (
        <header className="mb-6 mt-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">{b.text}</h1>
          {b.sub && <p className="mt-1 text-lg font-semibold tracking-wide">{b.sub}</p>}
        </header>
      );
    case "banner":
      return (
        <div role="note" className={`my-4 rounded-md border px-3 py-2 font-sans text-sm ${b.tone === "warn" ? "border-warn/40 bg-warn-bg text-warn" : "border-info/30 bg-info-bg text-info"}`}>
          <Text s={b.text} />
        </div>
      );
    case "h1":
      return <h2 id={b.anchor} className="sec"><Text s={b.text} /></h2>;
    case "h2":
      return <h3 className="sub">{b.text}</h3>;
    case "p":
      return b.num ? (
        <p className="clause"><span className="n">{b.num}</span><span><Text s={b.text} /></span></p>
      ) : (
        <p className="plain"><Text s={b.text} /></p>
      );
    case "list":
      return <ul className="bul">{b.items.map((it, i) => <li key={i}><Text s={it} /></li>)}</ul>;
    case "kv":
      return (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="data">
            <tbody>
              {b.rows.map(([k, v]) => (
                <tr key={k}><th scope="row" className="!normal-case !tracking-normal">{k}</th><td><Text s={v} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "table":
      return (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="data">
            <thead><tr>{b.head.map((h, i) => <th key={i} className={b.align?.[i] === "r" ? "r" : ""}>{h}</th>)}</tr></thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className={b.align?.[j] === "r" ? "r" : ""}><Text s={c} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "sig":
      return (
        <div className="sigbox">
          <div className="mb-2 font-bold uppercase tracking-wide">{b.party}</div>
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[12rem_1fr]">
            <dt className="text-muted">Printed legal name</dt><dd>{b.printedName || "________________"}</dd>
            <dt className="text-muted">Entity name</dt><dd>{b.entity || "________________"}</dd>
            <dt className="text-muted">Authorized representative</dt><dd>{b.rep || "________________"}</dd>
            <dt className="text-muted">Title</dt><dd>{b.title || "________________"}</dd>
            <dt className="text-muted">Signature</dt><dd className="text-muted italic">Completed through the electronic signature service. Not pre-filled.</dd>
            <dt className="text-muted">Date and time signed</dt><dd className="text-muted italic">Recorded by the electronic signature service.</dd>
          </dl>
        </div>
      );
    case "witness":
      return <div className="sigbox text-muted">Witness block (completed in person by the witness): name, signature, date.</div>;
    case "notary":
      return <div className="sigbox text-muted">Notarial acknowledgment block (completed only by a notary public). This application does not notarize.</div>;
    case "pagebreak":
      return <hr className="my-6 border-border" />;
  }
}

export function ContractView({ doc }: { doc: BuiltDocument }) {
  return (
    <article className="contract rounded-lg border border-border bg-surface p-5 sm:p-8" aria-label="Agreement text">
      {doc.blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </article>
  );
}
