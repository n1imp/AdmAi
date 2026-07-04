import PaginaLegal from '../components/PaginaLegal.jsx';
import { politicaCookies } from '../lib/cookiePolicy.js';

export default function Cookies() {
  return <PaginaLegal doc={politicaCookies} />;
}
