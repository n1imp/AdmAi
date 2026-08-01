// Setup global dos testes do painel: matchers do jest-dom (toBeInTheDocument, etc.)
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// Orçamento de espera do findBy*/waitFor. O default de 1s era suficiente
// enquanto a cobertura instrumentava 35 arquivos; com `coverage.include`
// explícito são 86, e a sobrecarga fazia telas que carregam dados de forma
// assíncrona estourarem 1s de forma intermitente — testes diferentes falhavam
// a cada execução, e todos passavam isolados ou sem cobertura.
//
// Isto NÃO afrouxa asserção: as queries e expectativas seguem idênticas. Um
// componente quebrado continua reprovando, porque o elemento nunca aparece —
// só demora mais para o teste desistir.
configure({ asyncUtilTimeout: 5000 });
