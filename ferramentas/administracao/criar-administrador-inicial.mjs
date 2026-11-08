#!/usr/bin/env node
import {
  configuracaoAdministrador,
  garantirUsuarioAuth as garantirUsuarioAutenticacao,
  flagAmbiente as sinalizadorAmbiente,
  rpcPlataforma as funcaoBancoPlataforma,
  secureToken as seguroToken,
  upsertProfile as criarOuAtualizarPerfil,
} from '../apoio/acesso-administrativo-supabase.mjs';

async function principal() {
  configuracaoAdministrador();

  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const senha = process.env.PLATFORM_ADMIN_PASSWORD ?? '';
  const nomeCompleto = process.env.PLATFORM_ADMIN_FULL_NAME?.trim() || email?.split('@')[0] || '';
  const telefone = process.env.PLATFORM_ADMIN_PHONE?.trim() || null;

  if (!email) throw new Error('Falta PLATFORM_ADMIN_EMAIL.');
  if (nomeCompleto.length < 2)
    throw new Error('PLATFORM_ADMIN_FULL_NAME precisa ter pelo menos 2 caracteres.');

  console.log('PegaNaFrota — bootstrap do primeiro platform_admin');
  console.log(`Conta: ${email}`);

  const { user: usuario, created: criado } = await garantirUsuarioAutenticacao({
    email,
    password: senha,
    fullName: nomeCompleto,
    resetPassword: sinalizadorAmbiente('PLATFORM_ADMIN_RESET_PASSWORD', false),
  });
  console.log(`  Auth: ${criado ? 'conta criada' : 'conta já existente'} (${usuario.id})`);

  await criarOuAtualizarPerfil({ userId: usuario.id, fullName: nomeCompleto, phone: telefone });
  console.log('  Profile: ativo e sincronizado');

  const jaAdministrador = await funcaoBancoPlataforma('is_platform_admin', { p_user_id: usuario.id });
  if (jaAdministrador === true) {
    console.log('  Plataforma: esta conta já é platform_admin ativo. Nada a alterar.');
    return;
  }

  const token = seguroToken(32);
  await funcaoBancoPlataforma('issue_bootstrap_token', {
    p_token_plain: token,
    p_label: `bootstrap CLI · ${email}`,
    p_ttl_minutes: 15,
  });

  const resultado = await funcaoBancoPlataforma('consume_bootstrap_token', {
    p_token_plain: token,
    p_user_id: usuario.id,
  });

  const verificado = await funcaoBancoPlataforma('is_platform_admin', { p_user_id: usuario.id });
  if (verificado !== true) throw new Error('Bootstrap terminou sem confirmar o papel platform_admin.');

  console.log(`  Plataforma: bootstrap concluído (${resultado?.status ?? 'active'})`);
  console.log('Concluído. O token de bootstrap foi mantido apenas em memória.');
}

principal().catch((erro) => {
  const dica = erro?.body?.hint ?? erro?.body?.message ?? null;
  console.error(`Falha no bootstrap: ${erro.message}${dica ? `\nDetalhe: ${dica}` : ''}`);
  console.error('Se já existir outro platform_admin ativo, use npm run platform:replace.');
  process.exit(1);
});
