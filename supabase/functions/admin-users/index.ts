import { createClient as criarCliente } from 'jsr:@supabase/supabase-js@2';
import { tratarRequisicao } from './gerenciar-equipe.ts';

const ENDERECO_SUPABASE = Deno.env.get('SUPABASE_URL')!;
const CHAVE_PUBLICA = Deno.env.get('SUPABASE_ANON_KEY')!;
const CHAVE_PRIVILEGIADA_SERVIDOR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENDERECO_BASE_CONVITE = Deno.env.get('TEAM_INVITE_BASE_URL') ?? Deno.env.get('INVITE_BASE_URL') ?? '';
const DESTINO_CONVITE_EQUIPE = ENDERECO_BASE_CONVITE
  ? `${ENDERECO_BASE_CONVITE.replace(/\/$/, '')}/?flow=team-invite`
  : '';

const ORIGENS_PADRAO = [
  'app://peganafrota', // empacotamento Electron (ADR-002)
  'null', // renderer file:// no modo atual do Electron
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const ORIGENS_PERMITIDAS = (Deno.env.get('ADMIN_USERS_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((valor) => valor.trim())
  .filter((valor) => valor.length > 0);

Deno.serve((requisitar) =>
  tratarRequisicao(requisitar, {
    createUserClient: (cabecalhoAutorizacao: string) =>
      criarCliente(ENDERECO_SUPABASE, CHAVE_PUBLICA, {
        global: { headers: { Authorization: cabecalhoAutorizacao } },
        auth: { persistSession: false },
      }),
    createAdminClient: () =>
      criarCliente(ENDERECO_SUPABASE, CHAVE_PRIVILEGIADA_SERVIDOR, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    allowedOrigins: ORIGENS_PERMITIDAS.length > 0 ? ORIGENS_PERMITIDAS : ORIGENS_PADRAO,
    inviteRedirectTo: DESTINO_CONVITE_EQUIPE,
  }),
);
