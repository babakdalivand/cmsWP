import { useState } from '@wordpress/element';
import { Button, TextControl, SelectControl, ToggleControl, Notice, Spinner } from '@wordpress/components';
import { api } from '../api';

export default function SettingsTab({ initialSettings }) {
  const [s, setS] = useState(initialSettings || {});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveSettings({
        pays_ai_enabled:   s.ai_enabled,
        pays_ai_provider:  s.ai_provider,
        pays_ai_api_key:   s.ai_api_key,
        pays_ai_model:     s.ai_model,
        pays_ai_lang:      s.ai_lang,
        pays_auto_article: s.auto_article,
      });
      setNotice({ type: 'success', msg: 'Settings saved.' });
    } catch (e) {
      setNotice({ type: 'error', msg: e.message });
    }
    setSaving(false);
  };

  const upd = (key) => (val) => setS((p) => ({ ...p, [key]: val }));

  return (
    <div style={{ maxWidth: 560 }}>
      <h2>AI SEO Settings</h2>

      {notice && (
        <Notice status={notice.type} isDismissible onRemove={() => setNotice(null)}>
          {notice.msg}
        </Notice>
      )}

      <ToggleControl
        label="Enable AI SEO"
        checked={!!s.ai_enabled}
        onChange={upd('ai_enabled')}
        help="Auto-generate SEO content for approved videos"
      />

      <ToggleControl
        label="Auto-apply article content"
        checked={!!s.auto_article}
        onChange={upd('auto_article')}
        help="Overwrite post content with AI-generated article"
      />

      <SelectControl
        label="AI Provider"
        value={s.ai_provider || 'openai'}
        options={[
          { label: 'OpenAI (GPT)', value: 'openai' },
          { label: 'Anthropic (Claude)', value: 'claude' },
        ]}
        onChange={upd('ai_provider')}
      />

      <TextControl
        label="API Key"
        type="password"
        value={s.ai_api_key || ''}
        onChange={upd('ai_api_key')}
        help={
          s.ai_provider === 'claude'
            ? 'Get from console.anthropic.com'
            : 'Get from platform.openai.com'
        }
      />

      <TextControl
        label="Model"
        value={s.ai_model || ''}
        onChange={upd('ai_model')}
        placeholder={s.ai_provider === 'claude' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini'}
      />

      <SelectControl
        label="Default Language"
        value={s.ai_lang || 'en'}
        options={[
          { label: 'English', value: 'en' },
          { label: 'Persian (فارسی)', value: 'fa' },
        ]}
        onChange={upd('ai_lang')}
      />

      <Button variant="primary" onClick={save} disabled={saving}>
        {saving ? <Spinner /> : 'Save Settings'}
      </Button>
    </div>
  );
}
