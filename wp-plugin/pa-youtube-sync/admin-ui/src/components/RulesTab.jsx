import { useState, useEffect } from '@wordpress/element';
import {
  Button, TextControl, SelectControl, ToggleControl,
  Notice, Spinner, Modal,
} from '@wordpress/components';
import { api } from '../api';

/* ── Constants ──────────────────────────────────────────────────────── */

const FIELD_OPTIONS = [
  { label: 'Title',        value: 'title' },
  { label: 'Description',  value: 'description' },
  { label: 'Channel ID',   value: 'channel_id' },
  { label: 'YouTube ID',   value: 'yt_id' },
  { label: 'Type',         value: 'type' },
  { label: 'Duration (s)', value: 'duration_sec' },
  { label: 'Status',       value: 'status' },
];

const OPERATOR_OPTIONS = [
  { label: 'Contains',       value: 'contains' },
  { label: 'Not contains',   value: 'not_contains' },
  { label: 'Starts with',    value: 'starts_with' },
  { label: 'Ends with',      value: 'ends_with' },
  { label: 'Equals',         value: 'eq' },
  { label: 'Not equals',     value: 'neq' },
  { label: 'Greater than',   value: 'gt' },
  { label: 'Less than',      value: 'lt' },
  { label: 'Regex',          value: 'regex' },
  { label: 'In list (,)',    value: 'in' },
  { label: 'Not in list',    value: 'not_in' },
];

const ACTION_OPTIONS = [
  { label: 'Auto Approve',        value: 'approve' },
  { label: 'Auto Reject',         value: 'reject' },
  { label: 'Flag for Review',     value: 'flag_review' },
  { label: 'Add Tag',             value: 'add_tag' },
  { label: 'Set Category',        value: 'set_category' },
  { label: 'Set Series',          value: 'set_series' },
  { label: 'Set Topic',           value: 'set_topic' },
  { label: 'Notify Telegram',     value: 'notify_telegram' },
  { label: 'Generate Article',    value: 'generate_article' },
  { label: 'Generate AI SEO',     value: 'generate_ai_seo' },
];

const CONDITION_MODE_OPTIONS = [
  { label: 'ALL conditions match (AND)', value: 'all' },
  { label: 'ANY condition matches (OR)', value: 'any' },
];

const TERMINAL_ACTIONS = new Set(['approve', 'reject']);

const emptyRule = () => ({
  name: '',
  enabled: true,
  priority: 10,
  condition_mode: 'all',
  conditions: [],
  actions: [],
});

const emptyCondition = () => ({ field: 'title', operator: 'contains', value: '' });
const emptyAction    = () => ({ type: 'flag_review', value: '' });

/* ── Sub-components ──────────────────────────────────────────────────── */

function ConditionRow({ cond, index, onChange, onRemove }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-end',
      padding: '8px 10px', background: '#f8fafc', borderRadius: 6,
      border: '1px solid #e2e8f0', marginBottom: 6,
    }}>
      <div style={{ flex: '0 0 140px' }}>
        <SelectControl
          label={index === 0 ? 'Field' : undefined}
          value={cond.field}
          options={FIELD_OPTIONS}
          onChange={(v) => onChange(index, { ...cond, field: v })}
        />
      </div>
      <div style={{ flex: '0 0 150px' }}>
        <SelectControl
          label={index === 0 ? 'Operator' : undefined}
          value={cond.operator}
          options={OPERATOR_OPTIONS}
          onChange={(v) => onChange(index, { ...cond, operator: v })}
        />
      </div>
      <div style={{ flex: 1 }}>
        <TextControl
          label={index === 0 ? 'Value' : undefined}
          value={cond.value}
          onChange={(v) => onChange(index, { ...cond, value: v })}
          placeholder="value..."
        />
      </div>
      <Button isDestructive isSmall onClick={() => onRemove(index)} style={{ marginBottom: 2 }}>
        ✕
      </Button>
    </div>
  );
}

function ActionRow({ action, index, onChange, onRemove }) {
  const needsValue = !['approve', 'reject', 'generate_ai_seo'].includes(action.type);
  const valuePlaceholder =
    action.type === 'flag_review'       ? 'flag label (optional)' :
    action.type === 'add_tag'           ? 'tag name' :
    action.type === 'set_category'      ? 'category ID' :
    action.type === 'set_series'        ? 'term ID or slug' :
    action.type === 'set_topic'         ? 'term ID or slug' :
    action.type === 'notify_telegram'   ? 'message context' :
    action.type === 'generate_article'  ? 'tone: formal|podcast|news|educational' :
    '';

  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-end',
      padding: '8px 10px', background: '#f0fdf4', borderRadius: 6,
      border: '1px solid #bbf7d0', marginBottom: 6,
    }}>
      <div style={{ flex: '0 0 200px' }}>
        <SelectControl
          label={index === 0 ? 'Action' : undefined}
          value={action.type}
          options={ACTION_OPTIONS}
          onChange={(v) => onChange(index, { ...action, type: v })}
        />
      </div>
      {needsValue && (
        <div style={{ flex: 1 }}>
          <TextControl
            label={index === 0 ? 'Value' : undefined}
            value={action.value}
            onChange={(v) => onChange(index, { ...action, value: v })}
            placeholder={valuePlaceholder}
          />
        </div>
      )}
      {TERMINAL_ACTIONS.has(action.type) && (
        <span style={{
          padding: '2px 8px', background: '#fef3c7', borderRadius: 10,
          fontSize: 11, color: '#92400e', alignSelf: 'center',
          marginBottom: 2, border: '1px solid #fcd34d',
        }}>
          terminal — stops further rules
        </span>
      )}
      <Button isDestructive isSmall onClick={() => onRemove(index)} style={{ marginBottom: 2 }}>
        ✕
      </Button>
    </div>
  );
}

/* ── Rule editor modal ──────────────────────────────────────────────── */

function RuleEditor({ rule: initial, onSave, onClose }) {
  const [rule, setRule]     = useState(initial || emptyRule());
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const setField = (key, val) => setRule((r) => ({ ...r, [key]: val }));

  const updateCond = (i, val) =>
    setRule((r) => { const c = [...r.conditions]; c[i] = val; return { ...r, conditions: c }; });
  const removeCond = (i) =>
    setRule((r) => ({ ...r, conditions: r.conditions.filter((_, idx) => idx !== i) }));
  const addCond = () =>
    setRule((r) => ({ ...r, conditions: [...r.conditions, emptyCondition()] }));

  const updateAction = (i, val) =>
    setRule((r) => { const a = [...r.actions]; a[i] = val; return { ...r, actions: a }; });
  const removeAction = (i) =>
    setRule((r) => ({ ...r, actions: r.actions.filter((_, idx) => idx !== i) }));
  const addAction = () =>
    setRule((r) => ({ ...r, actions: [...r.actions, emptyAction()] }));

  const handleSave = async () => {
    if (!rule.name.trim()) { setError('Rule name is required'); return; }
    if (!rule.conditions.length) { setError('Add at least one condition'); return; }
    if (!rule.actions.length)    { setError('Add at least one action'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(rule);
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={rule.id ? `Edit Rule: ${rule.name}` : 'New Rule'}
      onRequestClose={onClose}
      style={{ maxWidth: 760 }}
    >
      {error && (
        <Notice status="error" isDismissible={false} style={{ marginBottom: 12 }}>
          {error}
        </Notice>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <TextControl
            label="Rule Name *"
            value={rule.name}
            onChange={(v) => setField('name', v)}
            placeholder="e.g. Auto-approve trusted channel"
          />
        </div>
        <div style={{ flex: '0 0 80px' }}>
          <TextControl
            label="Priority"
            type="number"
            value={rule.priority}
            onChange={(v) => setField('priority', Math.max(1, Math.min(100, +v)))}
            min={1} max={100}
          />
        </div>
        <div style={{ flex: '0 0 120px', paddingTop: 24 }}>
          <ToggleControl
            label="Enabled"
            checked={!!rule.enabled}
            onChange={(v) => setField('enabled', v)}
          />
        </div>
      </div>

      <SelectControl
        label="Condition mode"
        value={rule.condition_mode}
        options={CONDITION_MODE_OPTIONS}
        onChange={(v) => setField('condition_mode', v)}
        style={{ marginBottom: 12 }}
      />

      {/* Conditions */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: '#374151' }}>
          Conditions
        </div>
        {rule.conditions.map((c, i) => (
          <ConditionRow key={i} cond={c} index={i} onChange={updateCond} onRemove={removeCond} />
        ))}
        <Button variant="secondary" isSmall onClick={addCond}>+ Add Condition</Button>
      </div>

      {/* Actions */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: '#374151' }}>
          Actions
        </div>
        {rule.actions.map((a, i) => (
          <ActionRow key={i} action={a} index={i} onChange={updateAction} onRemove={removeAction} />
        ))}
        <Button variant="secondary" isSmall onClick={addAction}>+ Add Action</Button>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? <Spinner /> : 'Save Rule'}
        </Button>
      </div>
    </Modal>
  );
}

/* ── Main RulesTab ───────────────────────────────────────────────────── */

export default function RulesTab() {
  const [rules, setRules]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [notice, setNotice]     = useState(null);
  const [editing, setEditing]   = useState(null);
  const [showEditor, setEditor] = useState(false);
  const [telegram, setTelegram] = useState(null);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const data = await api.getRules();
      setRules(data);
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRules(); }, []);

  const openNew  = () => { setEditing(null); setEditor(true); };
  const openEdit = (r) => { setEditing(r); setEditor(true); };
  const closeEditor = () => { setEditor(false); setEditing(null); };

  const handleSave = async (data) => {
    if (data.id) {
      await api.updateRule(data.id, data);
      setNotice({ type: 'success', msg: `Rule "${data.name}" updated.` });
    } else {
      await api.createRule(data);
      setNotice({ type: 'success', msg: `Rule "${data.name}" created.` });
    }
    fetchRules();
  };

  const handleDelete = async (rule) => {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await api.deleteRule(rule.id);
      setNotice({ type: 'success', msg: `Rule "${rule.name}" deleted.` });
      fetchRules();
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    }
  };

  const handleToggle = async (rule) => {
    try {
      await api.toggleRule(rule.id, !rule.enabled);
      setRules((prev) =>
        prev.map((r) => r.id === rule.id ? { ...r, enabled: !rule.enabled } : r)
      );
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    }
  };

  const testTelegram = async () => {
    setTelegram('sending');
    try {
      const res = await api.testTelegram();
      setTelegram(res.sent ? 'ok' : 'fail');
    } catch {
      setTelegram('fail');
    }
    setTimeout(() => setTelegram(null), 4000);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>⚙️ Automation Rules</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="secondary"
            onClick={testTelegram}
            disabled={telegram === 'sending'}
          >
            {telegram === 'sending' ? <Spinner /> :
             telegram === 'ok'      ? '✅ Sent!' :
             telegram === 'fail'    ? '❌ Failed' :
             '📩 Test Telegram'}
          </Button>
          <Button variant="primary" onClick={openNew}>+ New Rule</Button>
        </div>
      </div>

      {notice && (
        <Notice status={notice.type} onRemove={() => setNotice(null)} isDismissible>
          {notice.msg}
        </Notice>
      )}

      {showEditor && (
        <RuleEditor rule={editing} onSave={handleSave} onClose={closeEditor} />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
      ) : rules.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 48, background: '#f8fafc',
          borderRadius: 8, color: '#94a3b8',
        }}>
          No rules yet. Click "+ New Rule" to create your first automation rule.
        </div>
      ) : (
        <div>
          {rules.map((rule) => (
            <div key={rule.id} style={{
              border: '1px solid #e2e8f0', borderRadius: 8,
              padding: '14px 16px', marginBottom: 10,
              background: rule.enabled ? 'white' : '#f8fafc',
              opacity: rule.enabled ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{rule.name}</span>
                    <span style={{
                      padding: '1px 7px', borderRadius: 10, fontSize: 11,
                      background: '#f1f5f9', color: '#64748b',
                    }}>
                      priority {rule.priority}
                    </span>
                    <span style={{
                      padding: '1px 7px', borderRadius: 10, fontSize: 11,
                      background: rule.enabled ? '#dcfce7' : '#fee2e2',
                      color: rule.enabled ? '#166534' : '#991b1b',
                    }}>
                      {rule.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    <span style={{ marginRight: 12 }}>
                      🔍 {rule.conditions?.length || 0} condition(s) [
                      {rule.condition_mode === 'any' ? 'OR' : 'AND'}]
                    </span>
                    <span>
                      ⚡ {rule.actions?.map((a) => a.type).join(', ')}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <Button
                    variant="secondary"
                    isSmall
                    onClick={() => handleToggle(rule)}
                  >
                    {rule.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button variant="secondary" isSmall onClick={() => openEdit(rule)}>
                    Edit
                  </Button>
                  <Button isDestructive isSmall onClick={() => handleDelete(rule)}>
                    Delete
                  </Button>
                </div>
              </div>

              {/* Conditions preview */}
              {rule.conditions?.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {rule.conditions.map((c, i) => (
                    <span key={i} style={{
                      padding: '2px 8px', background: '#eff6ff', borderRadius: 10,
                      fontSize: 11, color: '#1e40af', border: '1px solid #bfdbfe',
                    }}>
                      {c.field} {c.operator} "{c.value}"
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, padding: 16, background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', fontSize: 12, color: '#78350f' }}>
        <strong>ℹ️ How rules work:</strong> Rules run in priority order (1=highest) on every new video entering the queue.
        <b> Approve</b> and <b>Reject</b> actions are terminal — they stop further rule evaluation.
        Multiple conditions are combined with AND (all match) or OR (any match).
      </div>
    </div>
  );
}
