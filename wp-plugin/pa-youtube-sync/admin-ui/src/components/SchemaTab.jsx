import { useState } from '@wordpress/element';
import { Button, TextControl, Notice, Spinner, Card, CardBody } from '@wordpress/components';
import { api } from '../api';

export default function SchemaTab() {
  const [postId, setPostId] = useState('');
  const [lang, setLang]     = useState('en');
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice]   = useState(null);

  const load = async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const d = await api.getAI(parseInt(postId), lang);
      setData(d);
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    }
    setLoading(false);
  };

  const pretty = (json) => {
    try { return JSON.stringify(JSON.parse(json), null, 2); }
    catch { return json; }
  };

  return (
    <div>
      <h2>Schema & AI Content Viewer</h2>

      {notice && (
        <Notice status={notice.type} isDismissible onRemove={() => setNotice(null)}>
          {notice.msg}
        </Notice>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
        <TextControl
          label="Post ID"
          value={postId}
          onChange={setPostId}
          type="number"
          style={{ width: 120 }}
        />
        <Button variant="primary" onClick={load} disabled={loading}>
          {loading ? <Spinner /> : 'Load'}
        </Button>
      </div>

      {data && (
        <div style={{ display: 'grid', gap: 16 }}>
          {[
            { label: '🏷 SEO Title',        val: data.seo_title },
            { label: '📋 Meta Description', val: data.meta_description },
            { label: '📝 Excerpt',          val: data.excerpt },
            { label: '🏷 Tags',             val: data.tags },
          ].map(({ label, val }) => (
            <Card key={label}>
              <CardBody>
                <strong style={{ display: 'block', marginBottom: 6 }}>{label}</strong>
                <p style={{ margin: 0, fontSize: 13 }}>{val || <em style={{ color: '#888' }}>—</em>}</p>
              </CardBody>
            </Card>
          ))}

          {data.faq_schema && data.faq_schema !== '[]' && (
            <Card>
              <CardBody>
                <strong style={{ display: 'block', marginBottom: 8 }}>❓ FAQ Schema</strong>
                {JSON.parse(data.faq_schema).map((f, i) => (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 13 }}>Q: {f.question}</p>
                    <p style={{ margin: 0, fontSize: 13, color: '#555' }}>A: {f.answer}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {data.schema_json && data.schema_json !== '{}' && (
            <Card>
              <CardBody>
                <strong style={{ display: 'block', marginBottom: 8 }}>📐 VideoObject JSON-LD</strong>
                <pre style={{
                  background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 6,
                  fontSize: 11, overflow: 'auto', maxHeight: 300, margin: 0,
                }}>
                  {pretty(data.schema_json)}
                </pre>
              </CardBody>
            </Card>
          )}

          <p style={{ fontSize: 12, color: '#888' }}>
            Generated {data.generated_at} via {data.ai_provider}/{data.model} ·
            {parseInt(data.prompt_tokens) + parseInt(data.completion_tokens)} tokens
          </p>
        </div>
      )}
    </div>
  );
}
