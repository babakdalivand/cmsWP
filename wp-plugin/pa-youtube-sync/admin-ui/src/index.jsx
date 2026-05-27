import { render } from '@wordpress/element';
import App from './App';

const root = document.getElementById('pays-ai-seo-root');
if (root) {
  render(<App />, root);
}
