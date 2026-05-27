import { useState, useEffect } from '@wordpress/element';
import { Button, SelectControl, Notice, Spinner, Card, CardBody, CheckboxControl } from '@wordpress/components';
import { api } from '../api';

export default function GenerateTab() {
  const [posts, setPosts]       = useState([]);
  const [selected, setSelected] = useState([]);
  const [lang, setLang]         = useState(window.paysAI?.settings?.ai_lang || 'en');
  const [apply, setApply]       = useState(false);
  const [running, setRunning]   = useState(false);
  const [log, setLog]           = useState([]);
  const [notice, setNotice]     = useState(null);

  useEffect(() => {
    api.getVideoPosts()
      .then(setPosts)
      .catch((e) => setNotice({ type: 'error', msg: e.message }));
  }, []);

  const toggle = (id) =>
    setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const selectAll = () => setSelected(posts.map((p) => p.id));
  const clearAll  = () => setSelected([]);

  const run = async () => {
    if (!selected.length) return;
    setRunning(true);
    setLog([]);
    setNotice(null);

    for (const postId of selected) {
      const post  = posts.find((p) => p.id === postId);
      const title = post?.title?.rendered || `Post #${postId}`;
      const ytId  = post?.meta?.pa_youtube_id || '';

      setLog((l) => [...l, { id: postId, title, status: 'running' }]);
      try {
        await api.generateAI(postId, ytId, lang);
        if (apply) await api.applyAI(postId, lang);
        setLog((l) => l.map((x) => x.id === postId ? { ...x, status: 'done' } : x));
      } catch (e) {
        setLog((l) => l.map((x) => x.id === postId ? { ...x, status: 'error', msg: e.message } : x));
      }
    }
    setRunning(false);
    setNotice({ type: 'success', msg: `Done. ${selected.length} post(s) processed.` });
  };

  return (
    <div>
      <h2>Bulk AI Generate</h2>

      {notice && (
        <Notice status={notice.type} isDismissible onRemove={() => setNotice(null)}>
          {notice.msg}
        </Notice>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <SelectControl
          label="Language"
          value={lang}
          options={[
            { label: 'English', value: 'en' },
            { label: 'Persian (فارسی)', value: 'fa' },
          ]}
          onChange={setLang}
          style={{ marginBottom: 0 }}
        />
        <CheckboxControl
          label="Apply to post (overwrite title/content/tags)"
          checked={apply}
          onChange={setApply}
        />
        <Button variant="secondary" onClick={selectAll} size="small">Select All</Button>
        <Button variant="secondary" onClick={clearAll} size="small">Clear</Button>
        <Button variant="primary" onClick={run} disabled={running || !selected.length}>
          {running ? <><Spinner /> Generating…</> : `✨ Generate (${selected.length})`}
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Post list */}
        <Card style={{ flex: 1, maxHeight: 400, overflow: 'auto' }}>
          <CardBody style={{ padding: 0 }}>
            {posts.length === 0 && <p style={{ padding: 16, color: '#888' }}>Loading posts…</p>}
            {posts.map((p) => {
              const logEntry = log.find((l) => l.id === p.id);
              return (
                <label
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                    cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                    background: selected.includes(p.id) ? '#f0f8ff' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  <span style={{ flex: 1, fontSize: 13 }}
                    dangerouslySetInnerHTML={{ __html: p.title?.rendered || `#${p.id}` }} />
                  {logEntry && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                      background: logEntry.status === 'done' ? '#d1fae5' : logEntry.status === 'error' ? '#fee2e2' : '#fef3c7',
                      color:      logEntry.status === 'done' ? '#065f46' : logEntry.status === 'error' ? '#991b1b' : '#92400e',
                    }}>
                      {logEntry.status === 'running' ? '⏳' : logEntry.status === 'done' ? '✓' : '✗'}
                    </span>
                  )}
                </label>
              );
            })}
          </CardBody>
        </Card>

        {/* Log */}
        {log.length > 0 && (
          <Card style={{ width: 300 }}>
            <CardBody>
              <h4 style={{ margin: '0 0 8px' }}>Progress</h4>
              {log.map((l) => (
                <div key={l.id} style={{ fontSize: 12, marginBottom: 4 }}>
                  {l.status === 'done' ? '✅' : l.status === 'error' ? '❌' : '⏳'}{' '}
                  {l.title}
                  {l.msg && <span style={{ color: '#ef4444', display: 'block', marginLeft: 20 }}>{l.msg}</span>}
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
