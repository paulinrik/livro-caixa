# Caixa

App para marcar receitas e despesas, com categorias, meses separados e gráfico comparativo.
Funciona no navegador e pode ser instalado no celular (PWA). Os dados ficam salvos só no aparelho.

## Instalar no celular

Endereço: `https://paulinrik.github.io/livro-caixa/`

- **Android (Chrome):** abra o endereço, toque nos três pontinhos e em **Instalar app** (ou **Adicionar à tela inicial**).
- **iPhone (Safari):** abra o endereço, toque em **Compartilhar** e em **Adicionar à Tela de Início**.

## Importar extrato

Na aba **Importar**, escolha o extrato do banco (PDF, OFX ou CSV). O app lê o dia e o valor, deixa de fora o que
você já lançou e mostra um lançamento por vez, com o valor, o tipo da operação (Pix recebido, Compra realizada…) e o estabelecimento ou a pessoa: toque na categoria e ele passa para o próximo.
No fim, uma tela de revisão deixa confirmar, alterar ou apagar antes de lançar.
Importar o mesmo arquivo de novo não duplica nada.

## Backup

Em **Backup**, no fim da página, exporte um arquivo `.json` de tempos em tempos.
Para levar os dados a outro aparelho, use **Importar backup** nele.

## Arquivos

- `index.html`: o app inteiro (HTML, CSS e JavaScript)
- `manifest.webmanifest`: nome, cores e ícones para a instalação
- `sw.js`: faz o app abrir sem internet
- `icons/`: ícones do app
