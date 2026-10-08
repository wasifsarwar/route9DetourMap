import type { EvaluatedAlert } from '../domain/types';

export function AlertDetails({ items }: { items: EvaluatedAlert[] }) {
  return <section className="alert-section">
    <div className="section-heading"><h2>Alerts considered together</h2><span className="count-badge">{items.length}</span></div>
    <p className="supporting-text">For your direction and the selected time.</p>
    {items.length === 0 && <p className="empty-message">No applicable alerts were found in the checked feeds.</p>}
    {items.map(({ alert, timing, affectsSelectedStop, reason }) => <details className="alert-detail" key={alert.id}>
      <summary><span>{alert.title}</span><span className={`alert-tag ${timing === 'uncertain' ? 'tag-uncertain' : affectsSelectedStop ? 'tag-affected' : ''}`}>
        {timing === 'uncertain' ? 'Needs review' : affectsSelectedStop ? 'Lists your stop' : 'Route alert'}
      </span></summary>
      <p>{reason}</p>
      <blockquote>{alert.rawText}</blockquote>
      {[...new Set([...alert.timingIssues, ...alert.sourceIssues, ...alert.geometryIssues])].length > 0 && <ul>
        {[...new Set([...alert.timingIssues, ...alert.sourceIssues, ...alert.geometryIssues])].map((issue) => <li key={issue}>{issue}</li>)}
      </ul>}
      <a href={alert.sourceUrl} target="_blank" rel="noreferrer">Original agency source</a>
    </details>)}
  </section>;
}
