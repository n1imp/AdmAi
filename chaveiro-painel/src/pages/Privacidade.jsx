import PaginaLegal from '../components/PaginaLegal.jsx';
import { politicaPrivacidade } from '../lib/legal.js';

export default function Privacidade() {
  return <PaginaLegal doc={politicaPrivacidade} />;
}
