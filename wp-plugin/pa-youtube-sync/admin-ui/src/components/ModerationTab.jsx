import { useState, useEffect, useCallback } from '@wordpress/element';
import { Button, SelectControl, Spinner, Notice, CheckboxControl } from '@wordpress/components';
import { api } from '../api';

const STATUS_OPTIONS = [
  { label: 'Pending',  value: 'pending'  },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

const FLAG_COLORS = {
  duplicate_detected: '#f59e0b',
  toxicity_flagged:   '#ef4444',
  rule_applied:       '#3b82f6',
  bulk_approve:       '#10b981',
  bulk_reject:        '#6b7280',
};

function Badge({ label, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, background: color + '22', color,
      border: `1px solid ${color}44`, marginRight: 4,
    }}>
      {label}
    </span>
  );
}

export default function ModerationTab() {
  const [items, setItems]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [status, setStatus]     = useState('pending');
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading]   = useState(false);
  const [notice, setNotice]     = useState(null);
  const [log, setLog]           = useState([]);
  const [showLog, setShowLog]   = useState(false);
  const [logLoading, setLogLoading] = useState(false);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getQueue({ status, limit: 50 });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setSelected(new Set());
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const fetchLog = async () => {
    setLogLoading(true);
    try {
      const data = await api.getModLog({ limit: 50 });
      setLog(data.items || []);
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    } finally {
      setLogLoading(false);
    }
  };

  const toggleLog = () => {
    if (!showLog) fetchLog();
    setShowLog((v) => !v);
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const runBulk = async (action) => {
    if (!selected.size) return;
    setLoading(true);
    try {
      const result = await api.bulkModerate([...selected].map(Number), action);
      setNotice({
        type: 'success',
        msg: `✓ Approved: ${result.approved} | Rejected: ${result.rejected}` +
          (result.errors.length ? ` | Errors: ${result.errors.length}` : ''),
      });
      fetchQueue();
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    } finally {
      setLoading(false);
    }
  };

  const parseNotes = (notes) => {
    if (!notes) return [];
    return notes.split('|').map((n) => n.trim()).filter(Boolean);
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>🛡 Moderation Queue</h2>

      {notice && (
        <Notice status={notice.type} onRemove={() => setNotice(null)} isDismissible>
          {notice.msg}
        </Notice>
      )}

      {/* Filters & bulk actions */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 160 }}>
          <SelectControl
            label="Status"
            value={status}
            options={STATUS_OPTIONS}
            onChange={(v) => setStatus(v)}
          />
        </div>
        <Button variant="secondary" onClick={fetchQueue} disabled={loading}>
          🔄 Refresh
        </Button>
        {selected.size > 0 && (
          <>
            <Button variant="primary" onClick={() => runBulk('approve')} disabled={loading}>
              ✅ Approve ({selected.size})
            </Button>
            <Button isDestructive onClick={() => runBulk('reject')} disabled={loading}>
              ✗ Reject ({selected.size})
            </Button>
          </>
        )}
        <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 13 }}>
          {total} total
        </span>
      </div>

      {/* Queue table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 48, background: '#f8fafc',
          borderRadius: 8, color: '#94a3b8',
        }}>
          No items with status "{status}"
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', width: 36 }}>
                <CheckboxControl
                  checked={selected.size === items.length}
                  indeterminate={selected.size > 0 && selected.size < items.length}
                  onChange={toggleAll}
                />
              </th>
              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Title</th>
              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Type</th>
              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Flags</th>
              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Duration</th>
              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Queued</th>
              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const flags = parseNotes(item.notes);
              const isSelected = selected.has(item.id);
              return (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: '1px solid #e2e8f0',
                    background: isSelected ? '#eff6ff' : 'white',
                  }}
                >
                  <td style={{ padding: '8px 12px' }}>
                    <CheckboxControl
                      checked={isSelected}
                      onChange={() => toggleSelect(item.id)}
                    />
                  </td>
                  <td style={{ padding: '8px 12px', maxWidth: 320 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>
                      {item.title?.substring(0, 80)}
                    </div>
                    {item.yt_id && (
                      <a
                        href={`https://youtube.com/watch?v=${item.yt_id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#3b82f6', fontSize: 11 }}
                      >
                        ▶ {item.yt_id}
                      </a>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#64748b' }}>
                    {item.type || 'video'}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {flags.map((f) => {
                      const [key] = f.split(':');
                      const color = key === 'duplicate' ? '#f59e0b'
                                  : key === 'toxicity'  ? '#ef4444'
                                  : '#6b7280';
                      return <Badge key={f} label={f} color={color} />;
                    })}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {item.duration_sec
                      ? new Date(item.duration_sec * 1000).toISOString().substr(11, 8)
                      : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {item.queued_at?.substring(0, 10)}
                  </td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {item.status === 'pending' && (
                      <>
                        <IndividualApprove id={item.id} onDone={fetchQueue} setNotice={setNotice} />
                        <IndividualReject  id={item.id} onDone={fetchQueue} setNotice={setNotice} />
                      </>
                    )}
                    {item.post_id && (
                      <a
                        href={`/wp-admin/post.php?post=${item.post_id}&action=edit`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ marginLeft: 6, fontSize: 12, color: '#3b82f6' }}
                      >
                        Edit post
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Moderation log */}
      <div style={{ marginTop: 32 }}>
        <Button variant="link" onClick={toggleLog}>
          {showLog ? '▲ Hide' : '▼ Show'} Moderation Log
        </Button>
        {showLog && (
          <div style={{ marginTop: 12 }}>
            {logLoading ? (
              <Spinner />
            ) : log.length === 0 ? (
              <p style={{ color: '#94a3b8' }}>No log entries yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Time</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Action</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Queue ID</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((entry) => (
                    <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {entry.created_at?.substring(0, 16)}
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <Badge
                          label={entry.action}
                          color={FLAG_COLORS[entry.action] || '#64748b'}
                        />
                      </td>
                      <td style={{ padding: '6px 10px', color: '#64748b' }}>
                        #{entry.queue_id}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#475569' }}>
                        {entry.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function IndividualApprove({ id, onDone, setNotice }) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try {
      await api.bulkModerate([id], 'approve');
      setNotice({ type: 'success', msg: '✅ Approved' });
      onDone();
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="primary" isSmall onClick={handle} disabled={busy} style={{ marginRight: 4 }}>
      {busy ? <Spinner /> : '✓'}
    </Button>
  );
}

function IndividualReject({ id, onDone, setNotice }) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try {
      await api.bulkModerate([id], 'reject');
      setNotice({ type: 'success', msg: '✗ Rejected' });
      onDone();
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button isDestructive isSmall onClick={handle} disabled={busy}>
      {busy ? <Spinner /> : '✗'}
    </Button>
  );
}
