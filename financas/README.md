# Finanças Pessoais

Aplicação simples para controlar rendimentos, despesas e poupança mês a mês.
É um único ficheiro (`index.html`): não precisa de instalação nem de servidor. Os dados ficam guardados no teu browser (localStorage).

## Como usar

1. Abre `index.html` no browser (duplo clique). Para ver como funciona, carrega em **Ver com dados de exemplo**. Depois apaga tudo em *Definições* antes de começares com os teus dados.
2. **Fixos e orçamento**: adiciona o salário e as despesas que se repetem todos os meses (renda, luz, internet, seguros, ginásio…) e define quanto contas gastar por mês em supermercado, transportes, saúde, etc.
3. **Definições**: escolhe a meta de poupança (por exemplo, 20% do rendimento), indica quanto já tens poupado e quantos meses queres no fundo de emergência.
4. **Importar do banco**: exporta os movimentos em CSV no homebanking e carrega o ficheiro. A app deteta as colunas (data, descrição, montante ou débito/crédito), classifica cada movimento por palavras-chave (Continente → Supermercado, EDP → Luz, Uber Eats → Restaurantes…), ignora movimentos já importados e marca automaticamente os fixos como pagos.
5. **Resumo**: escreve o saldo atual da conta e a app mostra:
   - **Quanto te falta** para pagar as despesas que faltam este mês (fixos por pagar + o que resta do orçamento essencial, comparado com o saldo + o que ainda vais receber);
   - **Quanto podes gastar em lazer**, no total e por dia até ao fim do mês;
   - quanto já poupaste e quanto falta para a meta;
   - para onde vai o dinheiro, por categoria e comparado com o orçamento;
   - a poupança acumulada e o progresso do fundo de emergência;
   - o histórico dos últimos 12 meses.

### Como se calcula o dinheiro para lazer

```
Rendimento do mês (recebido + ainda por receber)
− despesas fixas
− essenciais variáveis (o maior valor entre o orçamento e o que já gastaste)
− poupança (meta ou o que já poupaste, o maior)
= disponível para lazer
− lazer já gasto
= ainda podes gastar
```

Se indicares o saldo da conta, o valor fica também limitado pelo dinheiro que tens de facto:
`saldo + a receber − por pagar − poupança em falta`.

## Cópias de segurança

Como os dados vivem só no browser, exporta-os regularmente em *Definições → Exportar dados (.json)*, por exemplo para o Google Drive. Podes importar esse ficheiro noutro computador ou no telemóvel. Também podes exportar todos os movimentos para CSV e abri-los no Excel.

Para usares a app no telemóvel, publica a pasta no GitHub Pages (Settings → Pages) e abre o link. Cada dispositivo guarda os seus próprios dados, por isso usa exportar/importar para os passar de um para o outro.

## Ligação automática ao banco (próximo passo opcional)

Os bancos portugueses só permitem acesso automático às contas através da norma europeia PSD2 (Open Banking), usando um agregador autorizado como Enable Banking, GoCardless Bank Account Data, Tink ou Salt Edge. As condições e os preços de cada um mudam com frequência, por isso confirma qual aceita contas pessoais quando avançares.

Isto implica:

1. criar conta num agregador e obter as chaves da API;
2. ter um pequeno servidor (por exemplo, uma função serverless) que guarda essas chaves e o consentimento do banco. As chaves **nunca** podem estar no HTML;
3. renovar o consentimento no banco a cada 90 a 180 dias (é uma regra da PSD2);
4. fazer o servidor devolver os movimentos no mesmo formato que a importação CSV já usa.

Até lá, exportar o CSV uma vez por semana dá o mesmo resultado: classificação automática, deteção de duplicados e fixos marcados como pagos.
