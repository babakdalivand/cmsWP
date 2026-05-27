import { useState } from '@wordpress/element';
import { TabPanel } from '@wordpress/components';
import SettingsTab    from './components/SettingsTab';
import TranscriptTab  from './components/TranscriptTab';
import GenerateTab    from './components/GenerateTab';
import SchemaTab      from './components/SchemaTab';
import ArticleTab     from './components/ArticleTab';
import ModerationTab  from './components/ModerationTab';
import RulesTab       from './components/RulesTab';

const TABS = [
  { name: 'moderation', title: '🛡 Moderation',  className: 'tab-moderation' },
  { name: 'rules',      title: '⚙️ Rules',        className: 'tab-rules' },
  { name: 'article',    title: '📰 Article',      className: 'tab-article' },
  { name: 'generate',   title: '✨ SEO',           className: 'tab-generate' },
  { name: 'transcript', title: '📝 Transcripts',  className: 'tab-transcript' },
  { name: 'schema',     title: '📐 Schema',       className: 'tab-schema' },
  { name: 'settings',   title: '🔧 Settings',     className: 'tab-settings' },
];

export default function App() {
  const settings = window.paysAI?.settings || {};

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        padding: '20px 24px', marginBottom: 24, borderRadius: 8,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 28 }}>🤖</span>
        <div>
          <h1 style={{ margin: 0, color: '#fff', fontSize: 22, fontWeight: 700 }}>
            PA YouTube Sync — AI SEO Engine
          </h1>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
            Auto-generate transcripts, SEO content, schema markup and smart moderation
          </p>
        </div>
      </div>

      <TabPanel tabs={TABS} initialTabName="moderation">
        {(tab) => (
          <div style={{ padding: '16px 0' }}>
            {tab.name === 'moderation' && <ModerationTab />}
            {tab.name === 'rules'      && <RulesTab />}
            {tab.name === 'article'    && <ArticleTab />}
            {tab.name === 'generate'   && <GenerateTab />}
            {tab.name === 'transcript' && <TranscriptTab />}
            {tab.name === 'schema'     && <SchemaTab />}
            {tab.name === 'settings'   && <SettingsTab initialSettings={settings} />}
          </div>
        )}
      </TabPanel>
    </div>
  );
}
