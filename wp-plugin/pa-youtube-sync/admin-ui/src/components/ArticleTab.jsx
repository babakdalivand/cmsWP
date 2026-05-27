import { useState, useEffect } from '@wordpress/element';
import { Button, SelectControl, Notice, Spinner, Card, CardBody, CheckboxControl, Badge } from '@wordpress/components';
import { api } from '../api';

const TONES = [
  { label: '📚 Formal',      value: 'formal' },
  { label: '🎙 Podcast',     value: 'podcast' },
  { label: '📰 News',        value: 'news' },
  { label: '🎓 Educational', value: 'educational' },
];

const TONE_COLORS = {
  formal: '#3b82f6', podcast: '#8b5cf6', news: '#ef4444', educational: '#10b981',
};

export default function ArticleTab() {
  const [posts, setPosts]         = useState([]);
  const [selected, setSelected]   = useState([]);
  const [tone, setTone]           = useState('formal');
  const [lang, setLang]           = useState(window.paysAI?.settings?.ai_lang || 'en');
  const [queuing, setQueuing]     = useState(false);
  const [notice, setNotice]       = useState(null);
  const [counts, setCounts]       = useState({});
  const [queue, setQueue]         = useState([]);
  const [loadingQueue, setLQ]     = useState(false);
  const [rewritePost, setRwPost]  = useState('');
  const [rewriteTone, setRwTone]  = useState('podcast');
  const [rewriting, setRewriting] = useState(false);

  useEffect(() => {
    api.getVideoPosts().then(setPosts).catch(console.error);
    loadQueue();
  }, []);

  const loadQueue = async () => {
    setLQ(true);
    try {
      const [q, c] = await Promise.all([
        api.getArticleQueue(),
        api.getArticleQueueCounts(),
      ]);
      setQueue(q);
      setCounts(c);
    } catch (e) { console.error(e); }
    setLQ(false);
  };

  const toggle = (id) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const queueSelected = async () => {
    if (!selected.length) return;
    setQueuing(true);
    setNotice(null);
    let ok = 0;
    for (const postId of selected) {
      const post = posts.find((p) => p.id === postId);
      const ytId = post?.meta?.pa_youtube_id || '';
      try {
        await api.queueArticle(postId, ytId, lang, tone);
        ok++;
      } catch (e) { console.error(e); }
    }
    setNotice({ type: 'success', msg: `${ok} video(s) queued for article generation.` });
    setSelected([]);
    setQueuing(false);
    setTimeout(loadQueue, 1000);
  };

  const retry = async (id) => {
    await api.retryArticle(id);
    loadQueue();
  };

  const publish = async (postId) => {
    try {
      const r = await api.publishArticle(postId);
      setNotice({ type: 'success', msg: `Published! ${r.url}` });
      loadQueue();
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    }
  };

  const doRewrite = async () => {
    if (!rewritePost) return;
    setRewriting(true);
    try {
      const r = await api.rewriteArticle(parseInt(rewritePost), rewriteTone);
      setNotice({ type: 'success', msg: `Rewritten with "${rewriteTone}" tone. ${r.word_count} words.` });
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    }
    setRewriting(false);
  };

  const statusBadge = (status) => {
    const map = {
      pending:    { bg: '#fef3c7', color: '#92400e', label: '⏳ Pending' },
      processing: { bg: '#dbeafe', color: '#1e40af', label: '⚙️ Processing' },
      done:       { bg: '#d1fae5', color: '#065f46', label: '✅ Done' },
      failed:     { bg: '#fee2e2', color: '#991b1b', label: '❌ Failed' },
    };
    const s = map[status] || map.pending;
    return (
      <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
        {s.label}
      </span>
    );
  };

  return (
    <div>
      <h2>Video → Blog Article</h2>

      {notice && (
        <Notice status={notice.type} isDismissible onRemove={() => setNotice(null)}>
          {notice.msg}
        </Notice>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 20px', textAlign: 'center', minWidth: 80 }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'capitalize' }}>{k}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

        {/* Queue new articles */}
        <Card>
          <CardBody>
            <h3 style={{ marginTop: 0 }}>Queue Articles</h3>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <SelectControl label="Tone" value={tone} options={TONES} onChange={setTone} style={{ marginBottom: 0 }} />
              <SelectControl
                label="Language"
                value={lang}
                options={[{ label: 'English', value: 'en' }, { label: 'Persian', value: 'fa' }]}
                onChange={setLang}
                style={{ marginBottom: 0 }}
              />
            </div>

            <div style={{ maxHeight: 250, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 12 }}>
              {posts.map((p) => (
                <label key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
                  cursor: 'pointer', background: selected.includes(p.id) ? '#eff6ff' : 'transparent',
                  borderBottom: '1px solid #f0f0f0',
                }}>
                  <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span style={{ fontSize: 13, flex: 1 }} dangerouslySetInnerHTML={{ __html: p.title?.rendered || `#${p.id}` }} />
                </label>
              ))}
            </div>

            <Button variant="primary" onClick={queueSelected} disabled={queuing || !selected.length}
              style={{ background: TONE_COLORS[tone], borderColor: TONE_COLORS[tone] }}>
              {queuing ? <Spinner /> : `✨ Queue ${selected.length} Article(s)`}
            </Button>
          </CardBody>
        </Card>

        {/* Rewrite tone */}
        <Card>
          <CardBody>
            <h3 style={{ marginTop: 0 }}>Rewrite Tone</h3>
            <p style={{ fontSize: 13, color: '#666' }}>
              Regenerate an existing article with a different writing style.
            </p>
            <SelectControl
              label="Post ID"
              value={rewritePost}
              options={[{ label: '— Select post —', value: '' }, ...posts.map((p) => ({
                label: (p.title?.rendered || `#${p.id}`).replace(/<[^>]+>/g, '').substring(0, 50),
                value: String(p.id),
              }))]}
              onChange={setRwPost}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {TONES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setRwTone(t.value)}
                  style={{
                    padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13,
                    border: `2px solid ${TONE_COLORS[t.value]}`,
                    background: rewriteTone === t.value ? TONE_COLORS[t.value] : 'transparent',
                    color: rewriteTone === t.value ? '#fff' : TONE_COLORS[t.value],
                    fontWeight: 600,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={doRewrite} disabled={rewriting || !rewritePost}>
              {rewriting ? <Spinner /> : '🔄 Rewrite'}
            </Button>
          </CardBody>
        </Card>
      </div>

      {/* Queue list */}
      <Card>
        <CardBody>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Article Queue</h3>
            <Button variant="secondary" size="small" onClick={loadQueue} disabled={loadingQueue}>
              {loadingQueue ? <Spinner /> : '↺ Refresh'}
            </Button>
          </div>

          {queue.length === 0 && <p style={{ color: '#888' }}>No items in queue.</p>}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            {queue.length > 0 && (
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Post', 'Tone', 'Lang', 'Status', 'Retries', 'Created', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {queue.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 10px', maxWidth: 200 }}>
                    <a href={`/wp-admin/post.php?post=${item.post_id}&action=edit`} style={{ fontSize: 12 }}>
                      {(item.post_title || `#${item.post_id}`).substring(0, 40)}
                    </a>
                    {item.error_msg && (
                      <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>{item.error_msg}</div>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ color: TONE_COLORS[item.tone], fontWeight: 600, fontSize: 12 }}>
                      {item.tone}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px' }}>{item.lang}</td>
                  <td style={{ padding: '8px 10px' }}>{statusBadge(item.status)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>{item.retries}</td>
                  <td style={{ padding: '8px 10px', fontSize: 11, color: '#888' }}>
                    {item.created_at?.substring(0, 16)}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {item.status === 'done' && (
                        <button onClick={() => publish(item.post_id)}
                          style={{ fontSize: 11, padding: '3px 8px', cursor: 'pointer', background: '#10b981', color: '#fff', border: 'none', borderRadius: 4 }}>
                          Publish
                        </button>
                      )}
                      {(item.status === 'failed' || item.status === 'pending') && (
                        <button onClick={() => retry(item.id)}
                          style={{ fontSize: 11, padding: '3px 8px', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4 }}>
                          Retry
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
