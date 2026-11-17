# Atualizar para o PegaNaFrota 1.2.3

## Alterações desta versão

- **Desktop sem ESP32.** A aba e o monitoramento saíram do aplicativo. O instalador dispensa leitor de placas e Python. Pátio, saída e retorno de viagens, cadastros e relatórios continuam disponíveis. O projeto preserva a implementação de referência da câmera.
- **Importação.** Produto e data precisam ser informados no abastecimento. Uma falha na consulta de placas permite conferir de novo sem perder o arquivo. As linhas já confirmadas ficam registradas e o reenvio só tenta as pendentes.
- **Administração.** Remover o acesso de um autor preserva o vínculo inativo e a autoria. A exclusão de empresa arquivada trata o histórico original, corrigido e anulado de odômetro. As confirmações seguem a mesma regra na tela e no banco. A busca de conta por e-mail foi reduzida a uma consulta.
- **Sessão e operação.** O painel oferece novo login quando a sessão não pode ser usada. Viagem com portaria sugere a única base ativa e continua exigindo a confirmação da passagem. O diagnóstico aceita garantia sem custo devidamente justificada.

## 1. Atualizar o Supabase

Abra o PowerShell na pasta que contém o `package.json` da versão 1.2.3. Para um banco que já recebeu a versão 1.2.2, a prévia lista as migrations `20261116000600`, `20261116000700` e `20261116000800`. A prévia também lista as migrations anteriores que ainda estiverem pendentes.

```powershell
npx.cmd --yes supabase@2.113.0 link --project-ref jnznizrtbivrvqkskcep
npx.cmd --yes supabase@2.113.0 db push --dry-run --linked
```

Confira a lista e a cópia de segurança antes de aplicar. Em seguida, publique as duas funções usadas pelo painel e pela Equipe do desktop.

```powershell
npx.cmd --yes supabase@2.113.0 db push --linked
npx.cmd --yes supabase@2.113.0 functions deploy platform-admin --project-ref jnznizrtbivrvqkskcep --use-api
npx.cmd --yes supabase@2.113.0 functions deploy admin-users --project-ref jnznizrtbivrvqkskcep --use-api
```

## 2. Publicar o painel e gerar o instalador Windows

1. Depois de atualizar o Supabase, envie o código da 1.2.3 para a `main` do GitHub e confira o deploy da Vercel.
2. Abra **GitHub → Actions → Gerar instalador Windows → Run workflow** e selecione `main`.
3. Quando o workflow terminar, baixe **PegaNaFrota-Instalador-Windows** em **Artifacts**. Extraia o arquivo e execute `PegaNaFrota-1.2.3-Instalador.exe` com o programa antigo fechado.
4. Confira a versão em **Meu perfil**. Em uma empresa de teste, cadastre um veículo e uma base, registre entrada e saída no Pátio e conclua uma viagem com quilometragem. No painel, confira a gestão de usuários e a auditoria.
