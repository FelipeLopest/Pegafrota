#!/usr/bin/env node
import {
  configuracaoAdministrador,
  excluirUsuarioAuth as excluirUsuarioAutenticacao,
  garantirUsuarioAuth as garantirUsuarioAutenticacao,
  flagAmbiente as sinalizadorAmbiente,
  buscarUsuarioAuthPorEmail as buscarUsuarioAutenticacaoPorEmail,
  rpcPlataforma as funcaoBancoPlataforma,
  upsertProfile as criarOuAtualizarPerfil,
} from '../apoio/acesso-administrativo-supabase.mjs';

async function principal() {
  configuracaoAdministrador();

  const emailAtor = process.env.PLATFORM_ACTOR_EMAIL?.trim().toLowerCase();
  const novoEmail = process.env.PLATFORM_NEW_ADMIN_EMAIL?.trim().toLowerCase();
  const nomeCompleto = process.env.PLATFORM_NEW_ADMIN_FULL_NAME?.trim() || novoEmail?.split('@')[0] || '';
  const senha = process.env.PLATFORM_NEW_ADMIN_PASSWORD ?? '';
  const telefone = process.env.PLATFORM_NEW_ADMIN_PHONE?.trim() || null;
  const motivo = process.env.PLATFORM_REPLACE_REASON?.trim() || 'Substituição do administrador da plataforma';
  const excluirAntigo = sinalizadorAmbiente(
    'PLATFORM_DELETE_OLD_AUTH',
    process.argv.includes('--delete-old'),
  );

  if (!emailAtor) throw new Error('Falta PLATFORM_ACTOR_EMAIL.');
  if (!novoEmail) throw new Error('Falta PLATFORM_NEW_ADMIN_EMAIL.');
  if (emailAtor === novoEmail) throw new Error('O novo administrador precisa usar outra conta.');
  if (nomeCompleto.length < 2)
    throw new Error('PLATFORM_NEW_ADMIN_FULL_NAME precisa ter pelo menos 2 caracteres.');

  const ator = await buscarUsuarioAutenticacaoPorEmail(emailAtor);
  if (!ator) throw new Error(`Administrador atual não encontrado no Auth: ${emailAtor}`);

  const atorEhAdministrador = await funcaoBancoPlataforma('is_platform_admin', { p_user_id: ator.id });
  if (atorEhAdministrador !== true) throw new Error(`${emailAtor} não é platform_admin ativo.`);

  console.log('PegaNaFrota — substituição de platform_admin');
  console.log(`  atual: ${emailAtor} (${ator.id})`);
  console.log(`  novo:  ${novoEmail}`);

  const { user: alvo, created: criado } = await garantirUsuarioAutenticacao({
    email: novoEmail,
    password: senha,
    fullName: nomeCompleto,
    resetPassword: sinalizadorAmbiente('PLATFORM_NEW_ADMIN_RESET_PASSWORD', false),
  });
  console.log(`  Auth novo: ${criado ? 'conta criada' : 'conta já existente'} (${alvo.id})`);

  await criarOuAtualizarPerfil({ userId: alvo.id, fullName: nomeCompleto, phone: telefone });
  console.log('  Profile novo: ativo e sincronizado');

  await funcaoBancoPlataforma('replace_platform_admin', {
    p_actor_user_id: ator.id,
    p_new_user_id: alvo.id,
    p_reason: motivo,
  });

  const alvoEhAdministrador = await funcaoBancoPlataforma('is_platform_admin', { p_user_id: alvo.id });
  if (alvoEhAdministrador !== true)
    throw new Error('A RPC retornou, mas o novo platform_admin não ficou ativo.');
  console.log('  Papel global: transferido com sucesso');

  if (excluirAntigo) {
    try {
      await excluirUsuarioAutenticacao(ator.id);
      console.log('  Auth antigo: removido');
    } catch (erro) {
      console.error('  Papel global já foi transferido, mas a conta antiga NÃO foi apagada.');
      console.error(`  Motivo: ${erro.message}`);
      console.error('  Verifique se a conta antiga ainda é o último company_admin de alguma empresa.');
      process.exitCode = 2;
    }
  } else {
    console.log('  Auth antigo: preservado. Use PLATFORM_DELETE_OLD_AUTH=true para removê-lo na troca.');
  }
}

principal().catch((erro) => {
  console.error(`Falha na substituição: ${erro.message}`);
  process.exit(1);
});
