import type { EvaluatedAlert } from '../domain/types';
import { presentAlertText } from '../domain/alertText';

export function AlertDetails({ items, onInspectAlert }: { items: EvaluatedAlert[]; onInspectAlert: (id: string) => void }) {
  return <section className="alert-section">
    <div className="section-heading"><h2>Alerts considered together</h2><span className="count-badge">{items.length}</span></div>
    <p className="supporting-text">For your direction and the selected time.</p>
    {items.length === 0 && <p className="empty-message">No applicable alerts were found in the checked feeds.</p>}
    {items.map(({ alert, timing, affectsSelectedStop, reason, stopScope }) => {
      const readable = presentAlertText(alert);
      const issues = [...new Set([...alert.timingIssues, ...alert.sourceIssues, ...alert.geometryIssues])];
      return <details className="alert-detail" key={alert.id}>
        <summary><span>{alert.title}</span><span className={`alert-tag ${timing === 'uncertain' ? 'tag-uncertain' : affectsSelectedStop ? 'tag-affected' : ''}`}>
          {timing === 'uncertain' ? stopScope === 'elsewhere' ? 'Elsewhere · timing unclear' : 'Needs review' : affectsSelectedStop ? 'Lists your stop' : stopScope === 'elsewhere' ? 'Elsewhere on route' : 'Stop impact unclear'}
        </span></summary>
        <div className="readable-alert">
          <h3>What the notice says</h3>
          <p>{readable.intro}</p>
          {readable.timing.map((line) => <p className="readable-timing" key={line}>{line}</p>)}
          {readable.steps.length > 0 && <ol>{readable.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol>}
          {readable.paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph}`}>{paragraph}</p>)}
        </div>
        {alert.timingIssues.length > 0 && <p className="alert-conflict">The notice and other agency data disagree about when this applies. The wording above does not resolve that conflict.</p>}
        <p>{reason}</p>
        {(alert.geometry.length > 0 || alert.candidateGeometry?.length) && <button className="inspect-detour" onClick={() => onInspectAlert(alert.id)}>Show this detour on the map</button>}
        <details className="original-alert"><summary>Original wording & source checks</summary>
          <blockquote>{readable.originalText}</blockquote>
          {issues.length > 0 && <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
          <a href={alert.sourceUrl} target="_blank" rel="noreferrer">Original agency source</a>
        </details>
      </details>;
    })}
  </section>;
}
