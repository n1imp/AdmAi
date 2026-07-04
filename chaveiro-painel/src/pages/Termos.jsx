import PaginaLegal from '../components/PaginaLegal.jsx';
import { termosDeUso } from '../lib/legal.js';

export default function Termos() {
  return <PaginaLegal doc={termosDeUso} />;
}
