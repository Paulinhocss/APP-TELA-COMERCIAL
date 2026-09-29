// Adaptador temporario da logica homologada anterior.
// Novas alteracoes devem migrar para componentes/hooks React tipados.
// @ts-nocheck
export function initSolicitacao() {

const $=id=>document.getElementById(id);
const num=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const money6=v=>'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:6});
function precoSugestaoLabel(s){const filialAtual=String($('filial')?.value||'01').trim()||'01';if(String(s.filialOrcamentoPreco||filialAtual)!==filialAtual)return ' · preço ao selecionar';const a=Number(s.precoMin||0),b=Number(s.precoMax||0),lista=String(s.listaPreco||'LP1');if(!(a>0))return ' · sem preço atual';const fmt=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2});const faixa=Math.abs(a-b)<0.000001?fmt(a):`${fmt(a)}–${fmt(b)}`;const tipo=String(s.tipoApresentacao||'').toUpperCase(),un=String(s.unidadeVenda||'').toUpperCase(),f=Number(s.fatorConversaoVenda||1);if(!s.apresentacaoMista&&tipo==='ROLO_FIXO'&&f>1){const emb=Math.abs(a-b)<0.000001?fmt(a*f):`${fmt(a*f)}–${fmt(b*f)}`;return ` · ${lista} ${faixa}/${un||'MT'} · ≈ ${emb}/rolo`}if(!s.apresentacaoMista&&(tipo==='BOBINA_CORTE'||tipo==='CARRETEL_CORTE'))return ` · ${lista} ${faixa}/${un||'MT'} · corte`;if(!s.apresentacaoMista&&tipo==='BLISTER_UNIDADE')return ` · ${lista} ${faixa}/${un||'PC'} · blister`;return ` · ${lista} ${faixa}${un?'/'+un:''}`}
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
let state={itens:[],mostrarSemEstoque:{},cliente:null,pagamento:{condPagtoId:null,fPagto:null,condicao:null},opcoesPagamento:{condicoes:[],formas:[]},proximaOrdem:1};
async function api(url,opt){const r=await fetch(url,opt);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.erro||'Erro '+r.status);return d}
function setMsg(t,c=''){ $('msg').className='msg '+c; $('msg').innerHTML=t }
const roundMoney=v=>Number(Number(v||0).toFixed(2));
function selectedFornecedor(item){return (item.fornecedores||[]).find(f=>String(f.CodFabricante_ID)===String(item.fornecedorSelecionado))||null}
function apresentacaoAtual(item){return selectedFornecedor(item)?.apresentacao||null}
function atualizarQuantidadeVenda(item,reset=false){const a=apresentacaoAtual(item);if(!a){item.quantidade=Number(item.quantidadeComercial||item.quantidadeSolicitada||0);return}const tipo=String(a.tipo||'UNIDADE').toUpperCase(),fator=Number(a.fatorConversao||1)||1;if(reset){if(tipo==='ROLO_FIXO'){item.quantidadeComercial=Number((Number(item.quantidadeSolicitada||0)*fator).toFixed(6))}else if(tipo==='BOBINA_CORTE'||tipo==='CARRETEL_CORTE'){item.quantidadeComercial=null}else{item.quantidadeComercial=Number(item.quantidadeSolicitada||0)}}const qc=Number(item.quantidadeComercial||0);item.quantidade=qc}
function calc(item){const q=Number(item.quantidade||0),p=Number(item.precoReferencia||0),d=Math.max(0,Math.min(100,Number(item.descontoPercentual||0)));const pn=p*(1-d/100);return{q,p,d,pn,totalLista:roundMoney(q*p),totalNeg:roundMoney(q*pn)}}
function margemNegociadaS22(item){const c=calc(item),m=item.motorPreco;if(!m?.valido||!(c.pn>0)||!(Number(m.custoBase)>0))return null;const margem=(1-(Number(m.cargaBasePercentual||0)/100)-(Number(m.custoFinanc||0)/100)-(Number(m.custoBase)/c.pn))*100;return Number.isFinite(margem)?margem:null}
function avaliacaoAlcadaS22(item){const a=item.alcada,m=item.motorPreco,margem=margemNegociadaS22(item);if(!a||!a.usuario||margem===null||!m?.valido)return null;const base=Number(m.margemBase||0),prodMin=Number(a.produto?.margemMinima||0);const mark=a.regras?.markup,markMin=a.regras?.markupMin;const markP=mark&&String(mark.flgValor||'').toUpperCase()==='P'?Number(mark.valorMax):null;const markMinP=markMin&&String(markMin.flgValor||'').toUpperCase()==='P'?Number(markMin.valorMax):null;const pisos=[];if(Number.isFinite(markP))pisos.push({origem:'Markup',valor:base-markP});if(prodMin>0){const folga=Number.isFinite(markMinP)?markMinP:0;pisos.push({origem:'Markup Min',valor:prodMin-folga})}if(!pisos.length)return{margem,base,prodMin,piso:null,fora:false,semRegra:true};const piso=Math.max(...pisos.map(x=>x.valor));return{margem,base,prodMin,piso,fora:margem+0.000001<piso,semRegra:false,pisos}}
function alcadaHtml(item){if(item.alcadaCarregando)return '<div class="alcada-box"><div class="alcada-note"><span class="spinner"></span> Consultando alçada do vendedor no Deak...</div></div>';if(item.alcadaErro)return `<div class="alcada-box"><div class="alcada-result neutral">Alçada não consultada: ${esc(item.alcadaErro)}</div></div>`;const a=item.alcada;if(!a)return '<div class="alcada-box"><div class="alcada-result neutral">Alçada: selecione produto/fabricante e informe o vendedor Deak.</div></div>';if(!a.usuario)return `<div class="alcada-box"><div class="alcada-result neutral">Usuário <strong>${esc(a.usuarioConsultado||$('vendedor')?.value||'')}</strong> sem regra de alçada localizada.</div><div class="alcada-note">S2.2A não bloqueia o item.</div></div>`;const ev=avaliacaoAlcadaS22(item),mk=a.regras?.markup,mm=a.regras?.markupMin,minProd=Number(a.produto?.margemMinima||0);const result=!ev?'<div class="alcada-result neutral">Aguardando preço negociado para estimar a margem.</div>':ev.semRegra?`<div class="alcada-result neutral">Margem estimada ${num(ev.margem)}% · nenhuma regra percentual combinável localizada.</div>`:`<div class="alcada-result ${ev.fora?'warn':'ok'}">${ev.fora?'⚠ Fora da alçada pela hipótese S2.2A · análise provável':'✓ Dentro da alçada pela hipótese S2.2A'} · margem ${num(ev.margem)}% · piso diagnóstico ${num(ev.piso)}%</div>`;return `<div class="alcada-box"><div class="alcada-head"><span>S2.2A · alçada comercial</span><span>${esc(a.usuario.usuario)} · ${esc(a.usuario.funcao||'')}</span></div><div class="alcada-grid"><div class="alcada-kpi"><div class="k">Margem base LP</div><div class="v">${num(item.motorPreco?.margemBase||0)}%</div></div><div class="alcada-kpi"><div class="k">Margem mín. produto</div><div class="v">${num(minProd)}%</div></div><div class="alcada-kpi"><div class="k">Limite Markup</div><div class="v">${mk?num(mk.valorMax)+esc(mk.flgValor||''):'—'}</div></div><div class="alcada-kpi"><div class="k">Limite Markup Min</div><div class="v">${mm?num(mm.valorMax)+esc(mm.flgValor||''):'—'}</div></div></div>${result}<div class="alcada-note">DIAGNÓSTICO: leitura real de UsuarioLimites/ProdutoFabrica. A interpretação conjunta ainda será homologada contra o Deak antes de bloquear qualquer venda.</div></div>`}

function selectedFilial(item){const f=selectedFornecedor(item);return (f?.filiais||[]).find(x=>String(x.Filial)===String(item.filialEstoqueSelecionada))||null}
function saldoSuficiente(item){const e=selectedFilial(item),q=Number(item.quantidade||0);return !!(e&&Number(e.EstoqueLiquido)>0&&q>0&&q<=Number(e.EstoqueLiquido))}
function multiploOk(q,m){q=Number(q||0);m=Number(m||0);if(!(q>0)||!(m>0))return false;const r=q/m;return Math.abs(r-Math.round(r))<=0.000001}
function validacaoQuantidade(item){const a=apresentacaoAtual(item),q=Number(item.quantidadeComercial||0);if(!a)return{ok:false,msg:'Apresentação não localizada'};if(!(q>0)){const t=String(a.tipo||'').toUpperCase();return{ok:false,msg:(t==='BOBINA_CORTE'||t==='CARRETEL_CORTE')?'Informar metragem':'Informar quantidade'}}const min=Number(a.qtMinVenda||0),flag=Number(a.qtMinVendaMultiplo||0)===1,m=Number(a.multiploVenda||min||0);const un=String(a.unidadeVenda||a.unidadeMedida||'').toUpperCase();if(min>0&&q+0.000001<min)return{ok:false,msg:`Mínimo ${num(min)} ${un}`};if(flag&&m>0&&!multiploOk(q,m))return{ok:false,msg:`Múltiplos de ${num(m)} ${un}`};return{ok:true,msg:''}}
function quantidadeComercialValida(item){return validacaoQuantidade(item).ok}
function pronta(item){const c=calc(item);return !!(item.produtoSelecionado&&item.fornecedorSelecionado&&quantidadeComercialValida(item)&&item.filialEstoqueSelecionada&&saldoSuficiente(item)&&item.precoAtual&&item.motorPreco?.valido&&c.q>0&&c.p>0)}
function itensAdicionados(){return state.itens.filter(i=>i.adicionado&&pronta(i)).sort((a,b)=>Number(a.ordemAdicao||999999)-Number(b.ordemAdicao||999999))}
function bloquearEdicao(item){return !!item?.adicionado}
function adicionarAoOrcamento(id){const item=state.itens.find(i=>i.id===id);if(!item)return;if(!pronta(item)){alert('Finalize produto, fabricante, filial, quantidade e preço antes de adicionar o item ao orçamento.');return}if(!item.adicionado){item.adicionado=true;item.ordemAdicao=state.proximaOrdem++;item.detalheAberto=null}render()}
function editarItemOrcamento(id){const item=state.itens.find(i=>i.id===id);if(!item)return;item.adicionado=false;item.ordemAdicao=null;render()}
function removerDoOrcamento(id){const item=state.itens.find(i=>i.id===id);if(!item)return;item.adicionado=false;item.ordemAdicao=null;render()}
function impedirSeAdicionado(item){if(item?.adicionado){alert('Este item já foi anexado ao orçamento. Clique em “Editar item” na grade ou no card do item antes de alterar.');return true}return false}
function supplierButton(item,f){const stock=Number(f.estoqueLiquidoTotal||0),p=f.precoAtualBase,a=f.apresentacao||{},filialAtual=String($('filial')?.value||'01').trim()||'01';let preco='preço ao selecionar';if(p&&String(p.filialOrcamento||filialAtual)===filialAtual&&Number(p.precoBase||0)>0){const pb=Number(p.precoBase||0),un=String(a.unidadeVenda||'').toUpperCase(),tipo=String(a.tipo||'').toUpperCase(),fator=Number(a.fatorConversao||1)||1;preco=`${esc(p.lista||'LP1')}: ${money(pb)}${un?'/'+esc(un):''}`;if(tipo==='ROLO_FIXO'&&fator>1)preco+=` · ≈ ${money(pb*fator)}/rolo`;else if(tipo==='BOBINA_CORTE'||tipo==='CARRETEL_CORTE')preco+=' · corte';else if(tipo==='BLISTER_UNIDADE')preco+=' · blister'}return `<button class="supplier ${item.fornecedorSelecionado===f.CodFabricante_ID?'active':''}" ${item.adicionado?'disabled':''} onclick="abrirFornecedor(${item.id},'${esc(f.CodFabricante_ID)}')"><div class="name">${esc(f.NomeFabricante||f.CodFabricante_ID)}</div><div class="stock ${stock>0?'good':'zero'}">Líquido: ${num(stock)}</div><div class="hint">${preco}</div></button>`}
function suppliersHtml(item){const todos=item.fornecedores||[];const com=todos.filter(f=>Number(f.estoqueLiquidoTotal)>0);const sem=todos.filter(f=>Number(f.estoqueLiquidoTotal)<=0);const mostrar=!!state.mostrarSemEstoque[item.id];const base=(com.length?com:(mostrar?sem:sem.slice(0,3))).map(f=>supplierButton(item,f)).join('');const extras=mostrar&&com.length?sem.map(f=>supplierButton(item,f)).join(''):'';const toggle=sem.length&&com.length?`<button class="supplier-more" onclick="toggleSemEstoque(${item.id})">${mostrar?'Ocultar':'Ver'} ${sem.length} sem estoque</button>`:'';return base+extras+toggle||'<span class="hint">Nenhum fabricante cadastrado.</span>'}
function toggleSemEstoque(id){state.mostrarSemEstoque[id]=!state.mostrarSemEstoque[id];render()}
function statusItem(item){
  if(item.adicionado)return '<span class="status ok">✓ No orçamento</span>';
  if(!item.produtoSelecionado)return item.sugestoes?.length?'<span class="status warn">Revisar produto</span>':'<span class="status bad">Não localizado</span>';
  if(item.produtoSelecionado.bitolaCompativel===false)return '<span class="status bad">Bitola incompatível</span>';
  if(item.produtoSelecionado.corCompativel===false&&Array.isArray(item.produtoSelecionado.coresEncontradas)&&item.produtoSelecionado.coresEncontradas.length)return '<span class="status bad">Cor incompatível</span>';
  if(!item.fornecedorSelecionado)return '<span class="status warn">Escolher fornecedor</span>';
  if(!quantidadeComercialValida(item))return `<span class="status warn">${esc(validacaoQuantidade(item).msg)}</span>`;
  if(!item.filialEstoqueSelecionada)return '<span class="status warn">Escolher filial</span>';
  if(!saldoSuficiente(item))return '<span class="status bad">Estoque insuficiente</span>';
  if(item.precoCarregando)return '<span class="status warn">Carregando preço</span>';
  if(item.precoErro)return '<span class="status bad">Preço base não localizado</span>';
  if(!item.precoAtual||!item.motorPreco?.valido)return '<span class="status warn">Validar preço atual</span>';
  if(!Number(item.precoReferencia||0))return '<span class="status warn">Confirmar preço</span>';
  const av=avaliacaoAlcadaS22(item);if(av?.fora)return '<span class="status warn">⚠ Pronta · análise provável</span>';
  return '<span class="status ok">✓ Pronta para adicionar</span>';
}
function motorHtml(item){
  if(item.precoCarregando)return '<div class="motor-loading"><span class="spinner"></span> Consultando LPreco da filial comercial...</div>';
  if(item.precoErro)return `<div class="motor-error">⚠ ${esc(item.precoErro)}</div>`;
  const b=item.precoAtual,m=item.motorPreco;
  if(!b)return '<div class="motor-loading">Selecione o fabricante para consultar o preço/custo atual do Deak.</div>';
  if(!m?.valido)return `<div class="motor-error">⚠ ${esc(m?.motivo||'Motor S2.1 indisponível.')}</div>`;
  const cf=Number(m.custoFinanc||0),dif=Number(item.precoReferencia||0)-Number(m.precoVendaFinal||0),manual=!!item.precoManualAlterado;
  return `<div class="motor-box"><div class="motor-title"><span>S2.1 · ${esc(b.lista||'LP1')} · preço ${esc(b.empresaPreco||'01')}/${esc(b.filialPreco||'01')}</span><span>${manual?'preço editado manualmente':'✓ cálculo aplicado'}</span></div><div class="motor-grid"><div class="motor-kpi"><div class="k">Preço base Deak</div><div class="v">${money6(b.precoBaseConsulta)}</div></div><div class="motor-kpi"><div class="k">Margem base</div><div class="v">${num(b.margemBaseConsulta)}%</div></div><div class="motor-kpi"><div class="k">Custo financeiro</div><div class="v">${cf.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%</div></div><div class="motor-kpi"><div class="k">Preço Vanguard</div><div class="v motor-price">${money6(m.precoVendaFinal)}</div></div><div class="motor-kpi"><div class="k">Custo base</div><div class="v">${money6(b.precoCusto)}</div></div><div class="motor-kpi"><div class="k">Custo apurado</div><div class="v">${money6(m.precoCustoApurado)}</div></div></div><div class="motor-note">Carga-base inferida: ${Number(m.cargaBasePercentual||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:6})}% · ${manual?`diferença manual x motor: ${money6(dif)} · `:''}homologação sem partilha/fiscal completo. ${manual?`<button class="btn motor-action" onclick="usarPrecoMotor(${item.id})">reaplicar motor</button>`:''}</div></div>`;
}
function commercialHtml(item){
  if(!item.fornecedorSelecionado)return '<span class="hint">Escolha o fabricante.</span>';
  const f=selectedFornecedor(item),a=f?.apresentacao||{},e=selectedFilial(item),r=f?.ultimaReferencia||null,c=calc(item);
  if(item.adicionado){const un=String(a.unidadeVenda||a.unidadeMedida||'').toUpperCase();return `<div class="added-card"><div class="added-card-head"><strong>✓ Item ${num(item.ordemAdicao)} anexado ao orçamento</strong><button class="btn secondary-soft" onclick="editarItemOrcamento(${item.id})">Editar item</button></div><div class="mini">${num(item.quantidade)} ${esc(un)} · ${money6(c.pn)} / ${esc(un)} · total ${money(c.totalNeg)} · estoque Filial ${esc(item.filialEstoqueSelecionada||'—')}</div></div>`}

  const tipo=String(a.tipo||'UNIDADE').toUpperCase(),un=String(a.unidadeVenda||a.unidadeMedida||'').toUpperCase(),fator=Number(a.fatorConversao||1)||1,qc=item.quantidadeComercial==null?'':Number(item.quantidadeComercial),qDeak=Number(item.quantidade||0),sol=Number(item.quantidadeSolicitada||0);
  const ref=r?`Histórico: orç. ${r.CodOrcamento_ID} · ${money(r.PrecoNegociado||r.PrecoUnitario||0)}${r.Margem!=null?' · margem '+num(r.Margem)+'%':''}<button class="btn ref-use" onclick="usarReferencia(${item.id})">usar histórico</button>`:'Sem referência histórica localizada.';
  const origem=e?`<div class="stock-origin ${saldoSuficiente(item)?'':'warn'}"><strong>Origem do estoque: Filial ${esc(e.Filial)}</strong> · Líquido ${num(e.EstoqueLiquido)} ${esc(un)}<span class="stock-after">Após este item: ${num(Number(e.EstoqueLiquido)-qDeak)} ${esc(un)}</span></div>`:'<div class="branch-required">⚠ Selecione de qual filial o estoque será utilizado.</div>';
  let rotulo='Qtd. unidades',step='1',min='1',info='';
  const minVenda=Number(a.qtMinVenda||0),usaMultiplo=Number(a.qtMinVendaMultiplo||0)===1,multiplo=Number(a.multiploVenda||minVenda||0),vq=validacaoQuantidade(item);
  if(tipo==='ROLO_FIXO'){rotulo=`Quantidade (${un||'MT'})`;step=String(multiplo>0?multiplo:(minVenda>0?minVenda:1));min=String(minVenda>0?minVenda:0.001);const precoRolo=Number(item.precoReferencia||0)*fator;const equiv=fator>0&&qDeak>0?qDeak/fator:0;info=`<div class="motor-note"><strong>Apresentação: ROLO</strong> · solicitação original: ${num(sol)} un. → sugestão inicial ${num(sol*fator)} ${esc(un||'MT')} · mínimo: ${num(minVenda)} ${esc(un||'MT')}${usaMultiplo?` · múltiplos de ${num(multiplo)} ${esc(un||'MT')}`:''} · quantidade atual: <strong>${num(qDeak)} ${esc(un||'MT')}</strong>${equiv>0?` (≈ ${num(equiv)} rolos)`:''}${precoRolo>0?` · referência ≈ ${money(precoRolo)}/rolo`:''}</div>`}
  else if(tipo==='CARRETEL_CORTE'){rotulo='Metros desejados';step='0.001';min='0.001';info=`<div class="branch-required"><strong>Apresentação: CARRETEL / CORTE</strong> · venda por metragem livre. QtdeUnidade (${num(a.qtdeUnidade||0)}) representa o carretel do fabricante e não multiplica a venda. Informe os MT desejados.</div>`}
  else if(tipo==='BOBINA_CORTE'){rotulo='Metros desejados';step='0.001';min='0.001';info=`<div class="branch-required"><strong>Apresentação: BOBINA / CORTE</strong> · informe a metragem que será cortada. O pedido original (${num(sol)} un.) fica apenas como referência.</div>`}
  else if(tipo==='METRO'){rotulo='Metros';step='0.001';min=String(minVenda>0?minVenda:0.001);info=`<div class="motor-note"><strong>Venda por metragem</strong> · quantidade Deak/estoque: ${num(qDeak)} ${esc(un||'MT')}</div>`}
  else if(tipo==='BLISTER_UNIDADE'){rotulo='Qtd. peças/blisters';step='1';min=String(minVenda>0?minVenda:1);const desc=String(item.produtoSelecionado?.DescricaoProduto||'');const mm=desc.match(/C\/\s*(\d+(?:[.,]\d+)?)\s*MT/i);const conteudo=mm?Number(mm[1].replace(',','.')):0;info=`<div class="motor-note"><strong>Apresentação: BLISTER</strong> · venda em ${esc(un||'PC')}.${conteudo>0?` Cada peça contém ${num(conteudo)} MT; ${qDeak>0?`${num(qDeak)} PC ≈ ${num(qDeak*conteudo)} MT.`:''}`:''} QtdeUnidade do cadastro (${num(a.qtdeUnidade||0)}) não é fator de venda.</div>`}
  else{rotulo=`Qtd. ${un||'un.'}`;step='1';min=String(minVenda>0?minVenda:0.001);info=`<div class="motor-note"><strong>Venda por unidade</strong> · quantidade Deak/estoque: ${num(qDeak)} ${esc(un)}</div>`}
  const avisoQtd=!vq.ok&&Number(item.quantidadeComercial||0)>0?`<div class="motor-error">⚠ ${esc(vq.msg)}</div>`:'';
  return `${origem}${info}${avisoQtd}${motorHtml(item)}${alcadaHtml(item)}<div class="commercial-grid" style="margin-top:8px"><div class="field"><label>${rotulo}</label><input type="number" min="${min}" step="${step}" value="${qc}" placeholder="${(tipo==='BOBINA_CORTE'||tipo==='CARRETEL_CORTE')?'Informe os metros':''}" oninput="editarQuantidadeComercial(${item.id},this.value)"></div><div class="field"><label>Preço confirmado${un?' / '+esc(un):''}</label><input type="number" min="0" step="0.000001" value="${item.precoReferencia??''}" placeholder="0,00" oninput="editar(${item.id},'precoReferencia',this.value)"></div><div class="field"><label>Desconto %</label><input type="number" min="0" max="100" step="0.001" value="${item.descontoPercentual??0}" oninput="editar(${item.id},'descontoPercentual',this.value)"></div><div class="field"><label>Unit. negociado${un?' / '+esc(un):''}</label><input value="${c.pn?c.pn.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:6}):''}" readonly></div></div><div class="calc"><div class="calc-line"><span>Total antes desconto</span><strong>${money(c.totalLista)}</strong></div><div class="calc-line total"><span>Total negociado</span><strong>${money(c.totalNeg)}</strong></div></div><div class="ref-badge">${ref}</div><div class="item-confirm"><span class="hint">Depois de confirmar, o item entra na grade do orçamento e fica bloqueado até você clicar em Editar.</span><button class="btn good" ${pronta(item)?'':'disabled'} onclick="adicionarAoOrcamento(${item.id})">Adicionar ao orçamento</button></div>`;
}
function render(){
  $('resultado').style.display='block';
  const prontas=itensAdicionados().length,totalQtd=state.itens.reduce((s,i)=>s+Number(i.quantidadeSolicitada??i.quantidade??0),0),comEst=state.itens.filter(i=>(i.fornecedores||[]).some(f=>Number(f.estoqueLiquidoTotal)>0)).length;
  $('mLinhas').textContent=state.itens.length;$('mQtd').textContent=num(totalQtd);$('mEstoque').textContent=comEst;$('mProntas').textContent=`${prontas}/${state.itens.length}`;
  $('linhas').innerHTML=state.itens.map(item=>{
    const opts=(item.sugestoes||[]).map(s=>`<option value="${s.CodProduto_ID}" ${item.produtoSelecionado&&Number(item.produtoSelecionado.CodProduto_ID)===Number(s.CodProduto_ID)?'selected':''}>${s.elegivelAuto?'✓ ':'⚠ '}${s.CodProduto_ID} · ${esc(s.DescricaoProduto)}${precoSugestaoLabel(s)} · ${s.quantidadeFornecedores} fab.</option>`).join('');
    const produto=item.produtoSelecionado,placeholder=!produto&&opts?'<option value="" selected>Selecione o produto correto...</option>':'';
    const compat=produto?`<div class="compat ${produto.elegivelAuto?'ok':'warn'}">${produto.elegivelAuto?'✓ Bitola, cor e categoria compatíveis':'⚠ Seleção manual — confira bitola/cor'}</div>`:'';
    return `<tr class="${item.adicionado?'row-added':''}"><td class="request"><strong>${esc(item.categoria)} · ${num(item.bitola)} mm · ${esc(item.cor)}</strong><div class="hint">${esc(item.textoOriginal)}</div></td><td class="qty">${num(item.quantidadeSolicitada??item.quantidade)}<div class="hint">un. solic.</div></td><td>${opts?`<select class="product-select ${!produto?'review':''}" ${item.adicionado?'disabled':''} onchange="trocarProduto(${item.id},this.value)">${placeholder}${opts}</select>`:'<span class="bad">Nenhuma sugestão</span>'}${produto?`<div class="desc">${esc(produto.DescricaoProduto)}</div><div class="score ${produto.confianca==='alta'?'ok':produto.confianca==='media'?'warn':'bad'}">Confiança ${esc(produto.confianca)} · score ${produto.score}</div>${compat}`:'<div class="compat warn">⚠ Nenhum produto pré-selecionado com segurança.</div>'}</td><td class="supplier-cell"><div class="suppliers">${suppliersHtml(item)}</div>${item.fornecedorSelecionado?`<div class="selected-line">Fabricante: ${esc(selectedFornecedor(item)?.NomeFabricante||item.fornecedorSelecionado)}${item.filialEstoqueSelecionada?` <span class="supplier-selected-stock">· Estoque Filial ${esc(item.filialEstoqueSelecionada)}</span>`:''}</div>`:''}</td><td class="commercial">${commercialHtml(item)}</td><td>${statusItem(item)}</td></tr><tr class="detail-row"><td colspan="6"><div class="detail ${item.detalheAberto?'open':''}">${renderDetail(item)}</div></td></tr>`;
  }).join('');
  renderGradeOrcamento();
  renderResumo();
}
function renderDetail(item){
  if(!item.detalheAberto)return '';
  const f=(item.fornecedores||[]).find(x=>x.CodFabricante_ID===item.detalheAberto);
  if(!f)return '';
  const a=f.apresentacao||{};
  const tipo=String(a.tipo||'UNIDADE').toUpperCase();
  const fator=Number(a.fatorConversao||1)||1;
  const un=String(a.unidadeVenda||a.unidadeMedida||'').toUpperCase();
  const solicitadoCliente=Number(item.quantidadeSolicitada||0);
  const fornecedorJaSelecionado=String(item.fornecedorSelecionado||'')===String(f.CodFabricante_ID);
  let qPreview=0;
  let solicitadoLabel='';
  if(tipo==='ROLO_FIXO'){
    qPreview=fornecedorJaSelecionado&&Number(item.quantidadeComercial||0)>0?Number(item.quantidadeComercial):Number((solicitadoCliente*fator).toFixed(6));
    const equiv=fator>0?qPreview/fator:0;
    solicitadoLabel=`${num(qPreview)} ${esc(un||'MT')}${equiv>0?` (≈ ${num(equiv)} rolos)`:''}`;
  }else if(tipo==='BOBINA_CORTE'||tipo==='CARRETEL_CORTE'){
    const metros=fornecedorJaSelecionado?Number(item.quantidadeComercial||0):0;
    qPreview=metros;
    solicitadoLabel=metros>0?`${num(metros)} ${esc(un||'MT')} (corte)`:'Metragem a informar';
  }else{
    const qtd=fornecedorJaSelecionado&&Number(item.quantidadeComercial||0)>0?Number(item.quantidadeComercial):solicitadoCliente;
    qPreview=qtd;
    solicitadoLabel=`${num(qtd)} ${esc(un||'PC')}`;
  }
  const cards=(f.filiais||[]).map(x=>{
    const liq=Number(x.EstoqueLiquido||0),selected=fornecedorJaSelecionado&&String(item.filialEstoqueSelecionada)===String(x.Filial);
    const precisaMetragem=(tipo==='BOBINA_CORTE'||tipo==='CARRETEL_CORTE')&&!(qPreview>0);
    const suf=!precisaMetragem&&qPreview>0&&liq>=qPreview&&liq>0;
    const cls=selected?' selected-stock':liq<=0?' zero-stock':(!precisaMetragem&&!suf)?' insufficient':'';
    const acao=selected?'✓ Estoque escolhido':precisaMetragem?'Selecionar e informar corte':suf?'Usar estoque desta filial':'Estoque insuficiente';
    return `<div class="stock-card selectable${cls}" onclick="selecionarFilial(${item.id},'${esc(f.CodFabricante_ID)}','${esc(x.Empresa||'01')}','${esc(x.Filial)}')"><h4>Filial ${esc(x.Filial)} ${selected?'<span class="stock-check">✓ escolhida</span>':''}</h4><div class="stock-lines"><span>Físico</span><strong>${num(x.EstoqueFisico)}</strong><span>VNDS</span><strong>${num(x.SaldoVNDS)}</strong><span>EXPE</span><strong>${num(x.SaldoEXPE)}</strong><span>Líquido</span><strong class="${liq>0?'ok':'bad'}">${num(liq)}</strong><span>Solicitado</span><strong>${solicitadoLabel}</strong></div><button class="btn stock-action ${(suf||precisaMetragem)?'good':''}" ${liq<=0?'disabled':''} onclick="event.stopPropagation();selecionarFilial(${item.id},'${esc(f.CodFabricante_ID)}','${esc(x.Empresa||'01')}','${esc(x.Filial)}')">${acao}</button></div>`
  }).join('')||'<div class="hint">Sem movimentos de estoque encontrados.</div>';
  const ref=f.ultimaReferencia?`<div class="hint">Última referência: orçamento ${f.ultimaReferencia.CodOrcamento_ID} · preço negociado ${money(f.ultimaReferencia.PrecoNegociado||f.ultimaReferencia.PrecoUnitario||0)} · margem ${num(f.ultimaReferencia.Margem)}%</div>`:'<div class="hint">Sem referência comercial histórica.</div>';
  const apresentacaoInfo=tipo==='ROLO_FIXO'?` · <strong>mín. ${num(a.qtMinVenda||0)} ${esc(un||'MT')}${Number(a.qtMinVendaMultiplo||0)===1?` / múltiplos de ${num(a.multiploVenda||a.qtMinVenda||0)}`:''}</strong>`:(tipo==='BOBINA_CORTE'||tipo==='CARRETEL_CORTE')?' · <strong>venda por corte/metragem</strong>':tipo==='BLISTER_UNIDADE'?' · <strong>blister/unidade</strong>':'';
  return `<div class="detail-head"><div><strong>${esc(f.NomeFabricante)}</strong> · cód. ${esc(f.CodFabricante_ID)}${f.RefFabricante?` · ref. ${esc(f.RefFabricante)}`:''}${apresentacaoInfo}<div class="hint">Estoque líquido total: ${num(f.estoqueLiquidoTotal)} · escolha obrigatoriamente a filial de origem</div>${ref}</div><button class="btn primary" onclick="selecionarFornecedor(${item.id},'${esc(f.CodFabricante_ID)}')">Selecionar fabricante</button></div><div class="detail-grid">${cards}</div>`
}

function renderGradeOrcamento(){
  const itens=itensAdicionados(),box=$('gradeOrcamento');if(!box)return;
  const total=itens.reduce((s,i)=>s+calc(i).totalNeg,0);
  $('gSolicitacao').textContent=state.itens.length;$('gAdicionados').textContent=itens.length;$('gBadge').textContent=itens.length;$('gTotal').textContent=money(total);
  if(!itens.length){box.className='quote-empty';box.innerHTML='Configure um item acima e clique em <strong>Adicionar ao orçamento</strong>.';return}
  box.className='';
  box.innerHTML=`<table class="quote-grid"><thead><tr><th>Item</th><th>Cód.</th><th>Descrição</th><th>Fabricante</th><th>Origem</th><th>Apresentação</th><th>Un.</th><th>Qtde.</th><th>Preço</th><th>Desc.</th><th>Total</th><th>Ações</th></tr></thead><tbody>${itens.map(i=>{const f=selectedFornecedor(i),a=f?.apresentacao||{},c=calc(i),un=String(a.unidadeVenda||a.unidadeMedida||'').toUpperCase(),tipo=String(a.tipo||'UNIDADE').replaceAll('_',' ');return `<tr><td class="nitem">${num(i.ordemAdicao)}</td><td><strong>${esc(i.produtoSelecionado?.CodProduto_ID||'')}</strong></td><td class="qdesc"><strong>${esc(i.produtoSelecionado?.DescricaoProduto||'')}</strong><span>${esc(i.categoria||'')} · ${num(i.bitola)} mm · ${esc(i.cor||'')}</span></td><td>${esc(f?.NomeFabricante||i.fornecedorSelecionado||'')}</td><td>Filial ${esc(i.filialEstoqueSelecionada||'—')}</td><td>${esc(tipo)}</td><td>${esc(un)}</td><td class="qty-cell"><strong>${num(i.quantidade)}</strong></td><td class="money-cell">${money6(c.pn)}</td><td>${num(c.d)}%</td><td class="money-cell">${money(c.totalNeg)}</td><td><div class="quote-grid-actions"><button class="btn secondary-soft" onclick="editarItemOrcamento(${i.id})">Editar</button><button class="btn danger-soft" onclick="removerDoOrcamento(${i.id})">Remover</button></div></td></tr>`}).join('')}</tbody></table>`
}
function renderResumo(){const prontas=itensAdicionados(),totLista=prontas.reduce((s,i)=>s+calc(i).totalLista,0),totNeg=prontas.reduce((s,i)=>s+calc(i).totalNeg,0);$('sProntos').textContent=`${prontas.length} / ${state.itens.length}`;$('sLista').textContent=money(totLista);$('sNeg').textContent=money(totNeg);$('sDesc').textContent=money(totLista-totNeg);const pagamentoOk=!!(state.pagamento.condPagtoId&&Number(state.pagamento.fPagto)>0);$('btnCriar').disabled=!(prontas.length>0&&state.cliente&&state.cliente.cadastro&&state.cliente.cadastro.cgc&&pagamentoOk)}

function dataBR(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('pt-BR')}
function clientMeta(c){return [c.fantasia,c.codigoExterno?`Cód. ${c.codigoExterno}`:null,c.cidade&&c.uf?`${c.cidade}/${c.uf}`:c.uf].filter(Boolean).join(' · ')}
async function pesquisarClientes(){
  const termo=$('clienteBusca').value.trim(); if(termo.length<2){$('clienteMsg').textContent='Digite ao menos 2 caracteres.';return}
  try{$('btnClienteBusca').disabled=true;$('clienteMsg').innerHTML='<span class="spinner"></span> Pesquisando cadastro Deak...';$('clienteResultados').innerHTML='';
    const d=await api('/api/clientes/pesquisar?q='+encodeURIComponent(termo)); const arr=d.resultados||[];
    $('clienteMsg').textContent=arr.length?`${arr.length} cliente(s) encontrado(s).`:'Nenhum cliente encontrado.';
    $('clienteResultados').innerHTML=arr.map(c=>`<div class="client-result" onclick="selecionarCliente('${esc(c.cgc)}')"><div><strong>${esc(c.nome||c.fantasia||'SEM NOME')}</strong><div class="meta">${esc(c.cgc)}${clientMeta(c)?' · '+esc(clientMeta(c)):''}</div></div><button class="btn">Selecionar</button></div>`).join('');
  }catch(e){$('clienteMsg').textContent=e.message}finally{$('btnClienteBusca').disabled=false}
}
async function selecionarCliente(cgc){
  try{$('clienteMsg').innerHTML='<span class="spinner"></span> Carregando cadastro do cliente...';
    const d=await api('/api/clientes/'+encodeURIComponent(cgc)); state.cliente=d; $('clienteResultados').innerHTML=''; renderCliente(); renderPagamento(); renderResumo();
    const c=d.cadastro||{}; if(c.vendedor)$('vendedor').value=c.vendedor; $('clienteMsg').textContent='✓ Cliente real carregado do Deak.';
  }catch(e){$('clienteMsg').textContent=e.message}
}
function renderCliente(){
  const box=$('clienteSelecionado'),banner=$('clienteBanner'); if(!state.cliente){box.classList.remove('show');banner.classList.remove('show');renderUltimaCondicao();return}
  const c=state.cliente.cadastro||{},cr=state.cliente.credito||{}; const end=[c.endereco,c.numero,c.bairro,c.cidade,c.uf].filter(Boolean).join(' · ');
  box.classList.add('show'); banner.classList.add('show'); $('clienteBannerNome').textContent=c.nome||c.fantasia||'Cliente'; $('clienteBannerDoc').textContent=c.cgc||'';
  box.innerHTML=`<div class="client-selected-head"><div><div class="client-selected-name">${esc(c.nome||c.fantasia||'CLIENTE')}</div><div class="hint">${esc(c.cgc||'')}${c.fantasia?' · '+esc(c.fantasia):''}${c.codigoExterno?' · cód. '+esc(c.codigoExterno):''}</div></div><button class="btn" onclick="limparCliente()">Trocar cliente</button></div>
  <div class="client-grid"><div class="client-card"><div class="k">Vendedor cadastro</div><div class="v">${esc(c.vendedor||'Não identificado')}</div></div><div class="client-card"><div class="k">Telefone</div><div class="v">${esc(c.telefone||'—')}</div></div><div class="client-card"><div class="k">E-mail</div><div class="v">${esc(c.email||'—')}</div></div><div class="client-card"><div class="k">Endereço</div><div class="v">${esc(end||'—')}</div></div></div>
  <details class="credit-secondary"><summary>Resumo de crédito · consulta complementar</summary><div><div class="credit-grid"><div class="credit-card"><div class="k">Limite manual</div><div class="v">${money(cr.limite)}</div></div><div class="credit-card"><div class="k">Validade</div><div class="v">${dataBR(cr.validade)}</div></div><div class="credit-card"><div class="k">Em aberto</div><div class="v">${money(cr.valorEmAberto)}</div></div><div class="credit-card"><div class="k">Vencido</div><div class="v ${Number(cr.valorVencido)>0?'bad':'ok'}">${money(cr.valorVencido)}</div></div><div class="credit-card"><div class="k">Pedidos em aberto</div><div class="v">${money(cr.pedidosEmAberto)}</div></div></div><div class="credit-note">Informativo apenas. Não bloqueia nem aprova este orçamento; a análise oficial continua na ferramenta específica de Análise de Crédito.</div></div></details>`;
  renderUltimaCondicao();
}
async function limparCliente(){state.cliente=null;$('clienteSelecionado').classList.remove('show');$('clienteBanner').classList.remove('show');$('clienteResultados').innerHTML='';$('clienteMsg').textContent='';state.pagamento={condPagtoId:null,fPagto:null,condicao:null};if($('condPagto'))$('condPagto').value='';if($('fPagto'))$('fPagto').value='';await recalcularTodosMotores();renderPagamento();renderResumo()}

async function carregarOpcoesPagamento(){
  try{
    const d=await api('/api/pagamento/opcoes');
    state.opcoesPagamento={condicoes:d.condicoes||[],formas:d.formas||[]};
    $('condPagto').innerHTML='<option value="">Selecione a condição...</option>'+state.opcoesPagamento.condicoes.map(c=>{
      const sem=Number(c.qtdeFormasPermitidas||0)===0;
      const sufixo=sem?' · ⚠ sem forma vinculada':` · ${num(c.qtdeFormasPermitidas)} forma${Number(c.qtdeFormasPermitidas)===1?'':'s'}`;
      return `<option value="${esc(c.condPagtoId)}" ${sem?'disabled':''}>${esc(c.condPagtoId)} · ${esc(c.descricao||'Sem descrição')} · custo ${Number(c.custoFinanc||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%${esc(sufixo)}</option>`
    }).join('');
    $('fPagto').innerHTML='<option value="">Selecione primeiro a condição...</option>';
    $('fPagto').disabled=true;
    renderPagamento();
  }catch(e){
    $('condPagto').innerHTML='<option value="">Erro ao carregar</option>';$('fPagto').innerHTML='<option value="">Erro ao carregar</option>';$('fPagto').disabled=true;
    $('pagamentoDetalhe').className='payment-detail empty';$('pagamentoDetalhe').textContent='Não foi possível carregar as opções de pagamento: '+e.message;
  }
}
function renderUltimaCondicao(){
  const box=$('ultimaCondicao'),u=state.cliente?.ultimaCondicao;
  if(!box)return;
  if(!u||!u.condPagtoId||!u.fPagto){box.classList.remove('show');box.innerHTML='';return}
  box.classList.add('show');
  box.innerHTML=`<div><span class="hint">Última condição usada por este cliente</span><br><strong>Orç. ${num(u.codOrcamento)} · ${esc(u.condPagtoId)} ${esc(u.condPagtoDescricao||'')} · ${esc(u.formaPagamentoDescricao||('Forma '+u.fPagto))}</strong><div class="hint" style="margin-top:4px">Custo financeiro cadastrado: ${Number(u.custoFinanc||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%</div></div><button class="btn" onclick="usarUltimaCondicao()">Usar última condição</button>`;
}
function preencherFormasPermitidas(){
  const sel=$('fPagto'),c=state.pagamento.condicao,formas=Array.isArray(c?.formasPermitidas)?c.formasPermitidas:[];
  state.pagamento.fPagto=null;
  if(!c){
    sel.innerHTML='<option value="">Selecione primeiro a condição...</option>';
    sel.disabled=true;
    return;
  }
  if(!formas.length){
    sel.innerHTML='<option value="">Sem forma vinculada no Deak</option>';
    sel.disabled=true;
    return;
  }
  sel.innerHTML='<option value="">Selecione a forma...</option>'+formas.map(f=>`<option value="${Number(f.fPagto)}">${Number(f.fPagto)} · ${esc(f.descricao||'Sem descrição')}</option>`).join('');
  if(formas.length===1){
    state.pagamento.fPagto=Number(formas[0].fPagto);
    sel.value=String(formas[0].fPagto);
    sel.disabled=true;
  }else{
    sel.disabled=false;
  }
}
async function escolherCondicao(id){
  state.pagamento.condPagtoId=id||null;state.pagamento.condicao=null;state.pagamento.fPagto=null;
  if(!id){preencherFormasPermitidas();await recalcularTodosMotores();renderPagamento();renderResumo();return}
  try{
    state.pagamento.condicao=await api('/api/pagamento/condicoes/'+encodeURIComponent(id));
    preencherFormasPermitidas();
  }catch(e){
    alert(e.message);state.pagamento.condPagtoId=null;$('condPagto').value='';preencherFormasPermitidas();
  }
  await recalcularTodosMotores();
  renderPagamento();renderResumo();
}
function escolherForma(v){
  const n=v?Number(v):null,c=state.pagamento.condicao,permitidas=Array.isArray(c?.formasPermitidas)?c.formasPermitidas:[];
  if(n&& !permitidas.some(f=>Number(f.fPagto)===Number(n))){
    alert('Esta forma de pagamento não está vinculada à condição selecionada no Deak.');
    state.pagamento.fPagto=null;$('fPagto').value='';renderPagamento();renderResumo();return;
  }
  state.pagamento.fPagto=n;renderPagamento();renderResumo()
}
async function usarUltimaCondicao(){
  const u=state.cliente?.ultimaCondicao;if(!u)return;
  const condResumo=state.opcoesPagamento.condicoes.find(c=>String(c.condPagtoId)===String(u.condPagtoId));
  if(!condResumo){alert('A última condição usada pelo cliente não está disponível no cadastro atual do Deak.');return}
  if(Number(condResumo.qtdeFormasPermitidas||0)===0){alert('A última condição usada pelo cliente hoje não possui formas vinculadas em CondPagamentoFormas.');return}
  $('condPagto').value=String(u.condPagtoId);
  await escolherCondicao(String(u.condPagtoId));
  const permitidas=state.pagamento.condicao?.formasPermitidas||[];
  if(!permitidas.some(f=>Number(f.fPagto)===Number(u.fPagto))){
    alert('A forma usada no último orçamento do cliente não está mais vinculada à condição no cadastro atual do Deak.');
    state.pagamento.fPagto=null;$('fPagto').value='';renderPagamento();renderResumo();return;
  }
  state.pagamento.fPagto=Number(u.fPagto);
  $('fPagto').value=String(u.fPagto);
  renderPagamento();renderResumo();
}
function renderPagamento(){
  renderUltimaCondicao();
  const d=$('pagamentoDetalhe'),b=$('pagamentoBanner'),c=state.pagamento.condicao;
  const permitidas=Array.isArray(c?.formasPermitidas)?c.formasPermitidas:[];
  const forma=permitidas.find(f=>Number(f.fPagto)===Number(state.pagamento.fPagto));
  if(!c){
    d.className='payment-detail empty';d.textContent='Selecione uma condição de pagamento. A Vanguard carregará somente as formas vinculadas a ela no Deak.';
  }else{
    const dias=(c.parcelasDias||[]).length?(c.parcelasDias||[]).map(x=>`${num(x)}d`).join(' / '):'Sem parcelas cadastradas';
    const formasTxt=permitidas.length?permitidas.map(f=>`${num(f.fPagto)} · ${esc(f.descricao||'Sem descrição')}`).join(' | '):'Nenhuma forma vinculada';
    d.className='payment-detail';
    d.innerHTML=`<div class="payment-detail-grid"><div class="payment-card"><div class="k">Condição</div><div class="v">${esc(c.condPagtoId)} · ${esc(c.descricao||'')}</div></div><div class="payment-card"><div class="k">Custo financeiro</div><div class="v">${Number(c.custoFinanc||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%</div></div><div class="payment-card"><div class="k">Parcelas</div><div class="v">${num(c.qtdeParcelas||0)}</div></div><div class="payment-card"><div class="k">Dias</div><div class="v">${esc(dias)}</div></div></div><div class="${permitidas.length?'hint':'branch-required'}" style="margin-top:10px"><strong>Formas permitidas:</strong> ${formasTxt}</div>`;
  }
  if(c&&forma){
    b.classList.add('show');$('pagamentoBannerTexto').textContent=`${c.condPagtoId} · ${c.descricao} | ${forma.fPagto} · ${forma.descricao}`;$('pagamentoBannerCusto').textContent=`Custo financeiro: ${Number(c.custoFinanc||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
  }else{b.classList.remove('show')}
}


async function carregarAlcadaItem(item){
  if(!item?.produtoSelecionado?.CodProduto_ID||!item?.fornecedorSelecionado)return;
  const usuario=String($('vendedor')?.value||'').trim();
  if(!usuario){item.alcada=null;item.alcadaErro='Informe o vendedor/usuário Deak.';return}
  item.alcadaCarregando=true;item.alcadaErro=null;
  try{item.alcada=await api('/api/comercial/alcada?usuario='+encodeURIComponent(usuario)+'&produto='+encodeURIComponent(item.produtoSelecionado.CodProduto_ID)+'&fabricante='+encodeURIComponent(item.fornecedorSelecionado));item.alcadaErro=null}
  catch(e){item.alcada=null;item.alcadaErro=e.message}
  finally{item.alcadaCarregando=false}
}
async function alterarUsuarioComercial(){const alvo=state.itens.filter(i=>i.produtoSelecionado&&i.fornecedorSelecionado);alvo.forEach(i=>{i.alcada=null;i.alcadaErro=null});render();await Promise.all(alvo.map(i=>carregarAlcadaItem(i)));render()}

async function carregarPrecoAtual(item,forcarAplicacao=false){
  if(!item?.produtoSelecionado?.CodProduto_ID||!item?.fornecedorSelecionado)return;
  item.precoCarregando=true;item.precoErro=null;render();
  try{
    const filial=String($('filial')?.value||'01').trim()||'01';
    const cf=Number(state.pagamento.condicao?.custoFinanc||0);
    const d=await api('/api/precos/base?filial='+encodeURIComponent(filial)+'&produto='+encodeURIComponent(item.produtoSelecionado.CodProduto_ID)+'&fabricante='+encodeURIComponent(item.fornecedorSelecionado)+'&custoFinanc='+encodeURIComponent(cf));
    item.precoAtual=d.base||null;item.motorPreco=d.motor||null;item.precoErro=null;
    if(item.motorPreco?.valido&&(forcarAplicacao||!item.precoManualAlterado)){
      item.precoReferencia=Number(item.motorPreco.precoVendaFinal||0)||null;
      item.precoManualAlterado=false;
    }
  }catch(e){item.precoAtual=null;item.motorPreco=null;item.precoErro=e.message}
  finally{item.precoCarregando=false;await carregarAlcadaItem(item);render()}
}
async function recalcularTodosMotores(){
  const alvo=state.itens.filter(i=>i.produtoSelecionado&&i.fornecedorSelecionado);
  await Promise.all(alvo.map(i=>carregarPrecoAtual(i,false)));
}
function usarPrecoMotor(id){const item=state.itens.find(i=>i.id===id);if(!item?.motorPreco?.valido||impedirSeAdicionado(item))return;item.precoReferencia=Number(item.motorPreco.precoVendaFinal||0);item.precoManualAlterado=false;item.descontoPercentual=0;render()}
async function alterarFilialOrcamento(v){const filial=String(v||'01').trim()||'01';$('filial').value=filial;await recalcularTodosMotores();renderResumo()}

async function analisar(){try{$('btnAnalisar').disabled=true;setMsg('<span class="spinner"></span> Interpretando e consultando catálogo/estoque...');const d=await api('/api/solicitacao/analisar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto:$('texto').value,filial:$('filial').value||'01'})});state.proximaOrdem=1;state.itens=(d.itens||[]).map(i=>({...i,quantidadeSolicitada:Number(i.quantidade||0),quantidadeComercial:Number(i.quantidade||0),fornecedorSelecionado:null,filialEstoqueSelecionada:null,empresaEstoqueSelecionada:'01',detalheAberto:null,precoReferencia:null,precoAtual:null,motorPreco:null,precoErro:null,precoCarregando:false,precoManualAlterado:false,descontoPercentual:0,alcada:null,alcadaErro:null,alcadaCarregando:false,adicionado:false,ordemAdicao:null}));render();setMsg(`✓ ${d.resumo.linhasIdentificadas} linhas e ${num(d.resumo.quantidadeTotal)} unidades identificadas.`,'ok')}catch(e){setMsg(e.message,'bad')}finally{$('btnAnalisar').disabled=false}}
async function trocarProduto(id,cod){const item=state.itens.find(i=>i.id===id);if(!item||impedirSeAdicionado(item))return;if(!cod){item.produtoSelecionado=null;item.fornecedores=[];item.fornecedorSelecionado=null;item.filialEstoqueSelecionada=null;item.empresaEstoqueSelecionada='01';item.detalheAberto=null;item.precoReferencia=null;item.precoAtual=null;item.motorPreco=null;item.precoErro=null;item.precoManualAlterado=false;item.alcada=null;item.alcadaErro=null;render();return}const sug=(item.sugestoes||[]).find(s=>Number(s.CodProduto_ID)===Number(cod));item.produtoSelecionado=sug||null;item.fornecedorSelecionado=null;item.filialEstoqueSelecionada=null;item.empresaEstoqueSelecionada='01';item.detalheAberto=null;item.quantidadeComercial=Number(item.quantidadeSolicitada||0);item.quantidade=Number(item.quantidadeSolicitada||0);item.precoReferencia=null;item.precoAtual=null;item.motorPreco=null;item.precoErro=null;item.precoManualAlterado=false;item.alcada=null;item.alcadaErro=null;state.mostrarSemEstoque[id]=false;render();try{const d=await api('/api/produtos/'+encodeURIComponent(cod)+'/fornecedores?filial='+encodeURIComponent($('filial').value||'01'));item.fornecedores=d.fornecedores||[];render()}catch(e){alert(e.message)}}
function abrirFornecedor(id,fab){const item=state.itens.find(i=>i.id===id);if(!item||impedirSeAdicionado(item))return;item.detalheAberto=item.detalheAberto===fab?null:fab;render()}
async function selecionarFornecedor(id,fab){
  const item=state.itens.find(i=>i.id===id);if(!item||impedirSeAdicionado(item))return;
  const mudou=String(item.fornecedorSelecionado)!==String(fab);
  item.fornecedorSelecionado=fab;item.detalheAberto=fab;
  if(mudou){item.filialEstoqueSelecionada=null;item.empresaEstoqueSelecionada='01';item.precoReferencia=null;item.precoAtual=null;item.motorPreco=null;item.precoErro=null;item.precoManualAlterado=false;item.descontoPercentual=0;item.alcada=null;item.alcadaErro=null;atualizarQuantidadeVenda(item,true)}
  render();await carregarPrecoAtual(item,true);
}
async function selecionarFilial(id,fab,empresa,filial){
  const item=state.itens.find(i=>i.id===id);if(!item||impedirSeAdicionado(item))return;
  const mudouFab=String(item.fornecedorSelecionado)!==String(fab);
  item.fornecedorSelecionado=fab;item.detalheAberto=fab;item.empresaEstoqueSelecionada=empresa||'01';item.filialEstoqueSelecionada=filial;
  if(mudouFab){item.precoReferencia=null;item.precoAtual=null;item.motorPreco=null;item.precoErro=null;item.precoManualAlterado=false;item.descontoPercentual=0;item.alcada=null;item.alcadaErro=null;atualizarQuantidadeVenda(item,true)}
  render();if(mudouFab||!item.precoAtual)await carregarPrecoAtual(item,true);
}
function usarReferencia(id){const item=state.itens.find(i=>i.id===id);if(!item||impedirSeAdicionado(item))return;const ref=selectedFornecedor(item)?.ultimaReferencia;if(!ref)return;const p=Number(ref.PrecoNegociado||ref.PrecoUnitario||0);if(p>0){item.precoReferencia=p;item.precoManualAlterado=true;item.descontoPercentual=0;render()}}
function editarQuantidadeComercial(id,v){const item=state.itens.find(i=>i.id===id);if(!item||impedirSeAdicionado(item))return;item.quantidadeComercial=v===''?null:Number(v);atualizarQuantidadeVenda(item,false);render()}
function editar(id,campo,v){const item=state.itens.find(i=>i.id===id);if(!item||impedirSeAdicionado(item))return;item[campo]=Number(v||0);if(campo==='precoReferencia')item.precoManualAlterado=true;render()}

async function criarOrcamentoTeste(){try{
  if(!state.cliente?.cadastro?.cgc)throw new Error('Selecione um cliente real do Deak antes de criar o orçamento TESTE.');
  if(!state.pagamento.condPagtoId)throw new Error('Selecione a condição de pagamento.');
  if(!Number(state.pagamento.fPagto))throw new Error('Selecione a forma de pagamento.');
  const itensOrigem=itensAdicionados();if(!itensOrigem.length)throw new Error('Adicione pelo menos um item à grade do orçamento antes de criar o TESTE.');const itens=itensOrigem.map(i=>{const f=selectedFornecedor(i),e=selectedFilial(i);return{CodProduto_ID:i.produtoSelecionado?.CodProduto_ID,CodFabricante_ID:i.fornecedorSelecionado,DescricaoProduto:i.produtoSelecionado?.DescricaoProduto,NomeFabricante:f?.NomeFabricante,RefFabricante:f?.RefFabricante,EmpresaEstoque:i.empresaEstoqueSelecionada||e?.Empresa||'01',FilialEstoque:i.filialEstoqueSelecionada,EstoqueFisico:Number(e?.EstoqueFisico||0),EstoqueLiquido:Number(e?.EstoqueLiquido||0),quantidade:Number(i.quantidade||0),quantidadeComercial:Number(i.quantidadeComercial||0),quantidadeSolicitadaCliente:Number(i.quantidadeSolicitada||0),precoReferencia:Number(i.precoReferencia||0),descontoPercentual:Number(i.descontoPercentual||0),SolicitacaoCategoria:i.categoria,SolicitacaoBitola:Number(i.bitola),SolicitacaoCor:i.cor}});
  $('btnCriar').disabled=true;$('btnCriar').textContent='Gravando TESTE...';
  const d=await api('/api/solicitacao/criar-orcamento-teste',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cliente:{cgc:state.cliente?.cadastro?.cgc,nome:state.cliente?.cadastro?.nome,filial:$('filial').value,vendedor:$('vendedor').value,atendente:$('atendente').value},pagamento:{condPagtoId:state.pagamento.condPagtoId,fPagto:Number(state.pagamento.fPagto)},observacoes:'Criado pela tela S2.2A com editor/confirmacao, grade e diagnostico de alcada comercial; unidade comercial/apresentacao, regra de quantidade, preco/custo atual LPreco, cliente real, pagamento e filial de origem do estoque por item',itens})});
  $('created').style.display='block';$('created').innerHTML=`✓ <strong>${esc(d.mensagem)}</strong> · ${d.itens} itens · total ${money(d.totalNegociado)} · pagamento: ${esc(d.pagamento?.condPagtoId||'')} ${esc(d.pagamento?.condicao||'')} / ${esc(d.pagamento?.forma||'')} · custo financeiro ${Number(d.pagamento?.custoFinanc||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}% · <a style="color:#b9ffe7" target="_blank" href="/api/teste/${d.numeroTeste}">ver JSON do TESTE</a>`;
}catch(e){alert(e.message)}finally{$('btnCriar').textContent='Criar orçamento TESTE';renderResumo()}}

carregarOpcoesPagamento();


Object.assign(window as any, { precoSugestaoLabel, api, setMsg, selectedFornecedor, apresentacaoAtual, atualizarQuantidadeVenda, calc, margemNegociadaS22, avaliacaoAlcadaS22, alcadaHtml, selectedFilial, saldoSuficiente, multiploOk, validacaoQuantidade, quantidadeComercialValida, pronta, itensAdicionados, bloquearEdicao, adicionarAoOrcamento, editarItemOrcamento, removerDoOrcamento, impedirSeAdicionado, supplierButton, suppliersHtml, toggleSemEstoque, statusItem, motorHtml, commercialHtml, render, renderDetail, renderGradeOrcamento, renderResumo, dataBR, clientMeta, pesquisarClientes, selecionarCliente, renderCliente, limparCliente, carregarOpcoesPagamento, renderUltimaCondicao, preencherFormasPermitidas, escolherCondicao, escolherForma, usarUltimaCondicao, renderPagamento, carregarAlcadaItem, alterarUsuarioComercial, carregarPrecoAtual, recalcularTodosMotores, usarPrecoMotor, alterarFilialOrcamento, analisar, trocarProduto, abrirFornecedor, selecionarFornecedor, selecionarFilial, usarReferencia, editarQuantidadeComercial, editar, criarOrcamentoTeste });
}
