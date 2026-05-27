import { useState } from '@wordpress/element';
import { Button, TextControl, SelectControl, Notice, Spinner, Card, CardBody } from '@wordpress/components';
import { api } from '../api';

export default function TranscriptTab() {
  const [ytId, setYtId]       = useState('');
  const [lang, setLang]       = useState('en');
  const [transcript, setTr]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice]   = useState(null);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const fetchTr = async (force = false) => {
    if (!ytId.trim()) return;
    setLoading(true);
    setNotice(null);
    try {
      const data = force
        ? await api.fetchTranscript(ytId.trim(), lang)
        : await api.getTranscript(ytId.trim(), lang);
      setTr(data);
      if (!data?.raw_text) setNotice({ type: 'warning', msg: 'No transcript found for this video.' });
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    }
    setLoading(false);
  };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await api.searchTranscripts(query);
      setResults(data);
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    }
    setSearching(false);
  };

  return (
    <div>
      <h2>Transcript Manager</h2>

      {notice && (
        <Notice status={notice.type} isDismissible onRemove={() => setNotice(null)}>
          {notice.msg}
        </Notice>
      )}

      <Card style={{ marginBottom: 24 }}>
        <CardBody>
          <h3 style={{ marginTop: 0 }}>Fetch Transcript</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <TextControl
              label="YouTube Video ID"
              value={ytId}
              onChange={setYtId}
              placeholder="dQw4w9WgXcQ"
              style={{ flex: 1, minWidth: 200 }}
            />
            <SelectControl
              label="Language"
              value={lang}
              options={[
                { label: 'English', value: 'en' },
                { label: 'Persian', value: 'fa' },
              ]}
              onChange={setLang}
            />
            <Button variant="secondary" onClick={() => fetchTr(false)} disabled={loading}>
              {loading ? <Spinner /> : 'Load'}
            </Button>
            <Button variant="primary" onClick={() => fetchTr(true)} disabled={loading}>
              {loading ? <Spinner /> : '↺ Fetch Fresh'}
            </Button>
          </div>

          {transcript?.raw_text && (
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 8px', color: '#666', fontSize: 13 }}>
                {transcript.word_count} words · {transcript.language} · source: {transcript.source}
              </p>
              <div style={{
                background: '#f6f7f7', border: '1px solid #dcdcde', borderRadius: 4,
                padding: 12, maxHeight: 200, overflow: 'auto', fontSize: 13, lineHeight: 1.6,
                direction: transcript.language === 'fa' ? 'rtl' : 'ltr',
              }}>
                {transcript.raw_text}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 style={{ marginTop: 0 }}>Search Transcripts</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <TextControl
              label="Search query"
              value={query}
              onChange={setQuery}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              style={{ flex: 1 }}
            />
            <Button variant="primary" onClick={search} disabled={searching}>
              {searching ? <Spinner /> : 'Search'}
            </Button>
          </div>

          {results.length > 0 && (
            <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f6f7f7' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #dcdcde' }}>Video ID</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #dcdcde' }}>Lang</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #dcdcde' }}>Words</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #dcdcde' }}>Relevance</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <a href={`https://youtube.com/watch?v=${r.yt_id}`} target="_blank" rel="noreferrer">{r.yt_id}</a>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{r.language}</td>
                    <td style={{ padding: '8px 12px' }}>{r.word_count}</td>
                    <td style={{ padding: '8px 12px' }}>{parseFloat(r.relevance).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
