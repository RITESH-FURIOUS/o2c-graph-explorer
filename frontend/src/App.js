import React, { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ReactMarkdown from 'react-markdown';

// ─────────────────────────────────────────────
// ▼▼▼  CONFIGURE YOUR BACKEND URL HERE  ▼▼▼
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';
// ─────────────────────────────────────────────

const NODE_COLORS = {
  SalesOrder:   '#4f9cf9',
  Delivery:     '#3dd68c',
  Billing:      '#f7c94f',
  JournalEntry: '#f97b4f',
  Customer:     '#c97bf7',
};
const NODE_SIZES = { SalesOrder:5, Delivery:5, Billing:5, JournalEntry:4, Customer:10 };

const BADGE_COLORS = {
  SalesOrder:   { bg:'rgba(79,156,249,0.15)',  color:'#4f9cf9',  border:'rgba(79,156,249,0.4)' },
  Delivery:     { bg:'rgba(61,214,140,0.15)',  color:'#3dd68c',  border:'rgba(61,214,140,0.4)' },
  Billing:      { bg:'rgba(247,201,79,0.15)',  color:'#f7c94f',  border:'rgba(247,201,79,0.4)' },
  JournalEntry: { bg:'rgba(249,123,79,0.15)',  color:'#f97b4f',  border:'rgba(249,123,79,0.4)' },
  Customer:     { bg:'rgba(201,123,247,0.15)', color:'#c97bf7',  border:'rgba(201,123,247,0.4)' },
};

function Badge({ type }) {
  const c = BADGE_COLORS[type] || { bg:'rgba(139,154,184,0.15)', color:'#8b9ab8', border:'rgba(139,154,184,0.3)' };
  return (
    <span style={{
      background:c.bg, color:c.color, border:`1px solid ${c.border}`,
      borderRadius:5, padding:'3px 9px',
      fontSize:11, fontFamily:'var(--mono)', fontWeight:700, letterSpacing:'0.5px', whiteSpace:'nowrap',
    }}>{type}</span>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'7px 14px',
      background:'var(--bg2)', border:'1px solid var(--border)',
      borderRadius:10, borderLeft:`3px solid ${color}`,
    }}>
      <span style={{ fontSize:16 }}>{icon}</span>
      <div>
        <div style={{ fontSize:17, fontWeight:700, fontFamily:'var(--mono)', color, lineHeight:1 }}>{value ?? '…'}</div>
        <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>{label}</div>
      </div>
    </div>
  );
}

function Tooltip({ node, pos }) {
  if (!node || !pos) return null;
  const p = node.properties || {};
  const keys = ({
    SalesOrder:   ['salesOrder','soldToParty','totalNetAmount','overallDeliveryStatus','creationDate'],
    Delivery:     ['deliveryDocument','shippingPoint','overallGoodsMovementStatus','creationDate'],
    Billing:      ['billingDocument','totalNetAmount','soldToParty','billingDocumentIsCancelled','creationDate'],
    JournalEntry: ['accountingDocument','glAccount','amountInTransactionCurrency','postingDate'],
    Customer:     ['businessPartner','businessPartnerFullName'],
  })[node.type] || Object.keys(p).slice(0,5);
  const hidden = Object.keys(p).length - keys.length;
  return (
    <div className="tooltip" style={{ left:Math.min(pos.x+16, window.innerWidth-340), top:Math.max(pos.y-60,10) }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <Badge type={node.type} />
        <span style={{ fontWeight:600, fontSize:13 }}>{node.label}</span>
      </div>
      {keys.map(k => p[k] !== undefined && (
        <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'3px 0', borderBottom:'1px solid var(--border)' }}>
          <span style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>{k}</span>
          <span style={{ fontSize:11, color:'var(--text)', textAlign:'right', maxWidth:170, wordBreak:'break-all' }}>
            {typeof p[k]==='boolean'?(p[k]?'Yes':'No'):String(p[k]??'—')}
          </span>
        </div>
      ))}
      {hidden>0 && <div style={{ fontSize:10, color:'var(--text3)', marginTop:6, fontStyle:'italic' }}>+{hidden} more fields</div>}
      <div style={{ fontSize:11, color:'var(--accent)', marginTop:6 }}>🔗 {node.connections} connections · Click to expand</div>
    </div>
  );
}

function Typing() {
  return (
    <div className="msg bot">
      <div className="avatar bot-av">G</div>
      <div className="bubble bot-bubble">
        <div style={{ display:'flex', gap:4, alignItems:'center', padding:'2px 0' }}>
          {[0,1,2].map(i=>(
            <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--text3)', animation:`dot 1.2s ${i*0.2}s infinite` }}/>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatMsg({ msg, onSample }) {
  const [showSql, setShowSql] = useState(false);
  if (msg.type === 'welcome') return (
    <div className="msg bot">
      <div className="avatar bot-av">G</div>
      <div style={{ maxWidth:290 }}>
        <div className="bubble bot-bubble">{msg.text}</div>
        <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:6 }}>
          {msg.samples.map((s,i)=>(
            <button key={i} className="chip" onClick={()=>onSample(s)}>{s}</button>
          ))}
        </div>
      </div>
    </div>
  );
  if (msg.role === 'user') return (
    <div className="msg user">
      <div className="avatar user-av">U</div>
      <div className="bubble user-bubble">{msg.content}</div>
    </div>
  );
  if (msg.off_topic) return (
    <div className="msg bot">
      <div className="avatar bot-av">G</div>
      <div className="bubble" style={{ background:'rgba(249,123,79,0.08)', border:'1px solid rgba(249,123,79,0.25)', color:'#f97b4f', borderRadius:12, padding:'10px 14px', fontSize:13 }}>
        ⚠️ {msg.content}
      </div>
    </div>
  );
  if (msg.error) return (
    <div className="msg bot">
      <div className="avatar bot-av">G</div>
      <div className="bubble" style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', color:'#ef4444', borderRadius:12, padding:'10px 14px', fontSize:13 }}>
        ❌ {msg.content}
      </div>
    </div>
  );
  return (
    <div className="msg bot">
      <div className="avatar bot-av">G</div>
      <div style={{ maxWidth:295 }}>
        <div className="bubble bot-bubble"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
        {msg.rowCount !== undefined && (
          <div style={{ fontSize:10, color:'var(--text3)', marginTop:4, fontFamily:'var(--mono)' }}>{msg.rowCount} row{msg.rowCount!==1?'s':''} returned</div>
        )}
        {msg.sql && (
          <>
            <span onClick={()=>setShowSql(v=>!v)} style={{ fontSize:10, color:'var(--text3)', cursor:'pointer', marginTop:4, display:'inline-flex', alignItems:'center', gap:4, fontFamily:'var(--mono)' }}>
              {showSql?'▲':'▼'} {showSql?'Hide':'View'} SQL
            </span>
            {showSql && <div style={{ marginTop:6, padding:'8px 10px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:6, fontFamily:'var(--mono)', fontSize:10, color:'var(--text3)', overflowX:'auto', whiteSpace:'pre-wrap', wordBreak:'break-all' }}>{msg.sql}</div>}
          </>
        )}
        {msg.data && msg.data.length>0 && msg.data.length<=8 && msg.columns && (
          <div style={{ overflowX:'auto', marginTop:8 }}>
            <table style={{ borderCollapse:'collapse', fontSize:10, width:'100%' }}>
              <thead><tr>{msg.columns.map(c=><th key={c} style={{ padding:'4px 8px', background:'var(--bg)', color:'var(--text3)', fontFamily:'var(--mono)', borderBottom:'1px solid var(--border)', textAlign:'left', whiteSpace:'nowrap' }}>{c}</th>)}</tr></thead>
              <tbody>{msg.data.map((row,i)=><tr key={i}>{msg.columns.map(c=><td key={c} style={{ padding:'4px 8px', borderBottom:'1px solid rgba(30,35,48,0.5)', color:'var(--text2)', maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={String(row[c]??'')}>{String(row[c]??'—')}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function NodeDetail({ detail, onClose }) {
  if (!detail) return null;
  const { node, data } = detail;
  return (
    <div style={{ position:'absolute', top:16, right:16, width:280, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, zIndex:100, maxHeight:'calc(100vh - 120px)', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.5)', animation:'fadeIn 0.15s ease' }}>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <Badge type={node.type} />
          <span style={{ fontSize:13, fontWeight:600 }}>{node.label}</span>
        </div>
        <button onClick={onClose} style={{ width:24, height:24, borderRadius:'50%', background:'var(--bg3)', border:'1px solid var(--border)', cursor:'pointer', color:'var(--text3)', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
      </div>
      <div style={{ padding:'12px 16px' }}>
        <div style={{ fontSize:10, letterSpacing:'1.5px', color:'var(--text3)', fontFamily:'var(--mono)', textTransform:'uppercase', marginBottom:8 }}>Properties</div>
        {Object.entries(node.properties||{}).map(([k,v])=>(
          <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)', gap:8 }}>
            <span style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)', flexShrink:0 }}>{k}</span>
            <span style={{ fontSize:11, color:'var(--text)', textAlign:'right', wordBreak:'break-all' }}>{typeof v==='boolean'?(v?'Yes':'No'):String(v??'—')}</span>
          </div>
        ))}
        {data?.items?.length>0 && (
          <>
            <div style={{ fontSize:10, letterSpacing:'1.5px', color:'var(--text3)', fontFamily:'var(--mono)', textTransform:'uppercase', margin:'14px 0 8px' }}>Line Items ({data.items.length})</div>
            {data.items.slice(0,5).map((item,i)=>(
              <div key={i} style={{ padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:11, color:'var(--text2)', lineHeight:1.5 }}>{Object.entries(item).slice(0,3).map(([k,v])=>`${k}: ${v}`).join(' · ')}</div>
            ))}
          </>
        )}
        {data?.orders?.length>0 && (
          <>
            <div style={{ fontSize:10, letterSpacing:'1.5px', color:'var(--text3)', fontFamily:'var(--mono)', textTransform:'uppercase', margin:'14px 0 8px' }}>Orders ({data.orders.length})</div>
            {data.orders.slice(0,5).map((o,i)=>(
              <div key={i} style={{ padding:'4px 0', borderBottom:'1px solid var(--border)', fontSize:11, color:'var(--text2)' }}>{o.salesOrder} — ₹{Number(o.totalNetAmount||0).toLocaleString()}</div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ════════ MAIN APP ════════ */
export default function App() {
  const [graphData,    setGraphData]    = useState({ nodes:[], links:[] });
  const [stats,        setStats]        = useState({});
  const [loading,      setLoading]      = useState(true);
  const [messages,     setMessages]     = useState([]);
  const [input,        setInput]        = useState('');
  const [chatLoading,  setChatLoading]  = useState(false);
  const [tooltip,      setTooltip]      = useState({ node:null, pos:null });
  const [nodeDetail,   setNodeDetail]   = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightIds, setHighlightIds] = useState(new Set());
  const [filterType,   setFilterType]   = useState('all');
  const [tab,          setTab]          = useState('chat');
  const [search,       setSearch]       = useState('');
  const [history,      setHistory]      = useState([]);
  const graphRef  = useRef();
  const msgEndRef = useRef();
  const inputRef  = useRef();

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/graph`).then(r=>r.json()),
      fetch(`${API_BASE}/stats`).then(r=>r.json()),
      fetch(`${API_BASE}/sample-queries`).then(r=>r.json()),
    ]).then(([g,s,q]) => {
      const cc = {};
      g.edges.forEach(e=>{ cc[e.source]=(cc[e.source]||0)+1; cc[e.target]=(cc[e.target]||0)+1; });
      setGraphData({ nodes: g.nodes.map(n=>({...n, connections:cc[n.id]||0, val:NODE_SIZES[n.type]||4})), links: g.edges.map(e=>({source:e.source,target:e.target,label:e.label})) });
      setStats(s);
      setMessages([{ type:'welcome', text:'👋 Hi! I can help you analyze the Order to Cash process. Here are some things you can ask:', samples:q.queries.slice(0,5) }]);
      setLoading(false);
    }).catch(()=>{
      setLoading(false);
      setMessages([{ role:'bot', error:true, content:`Cannot connect to backend at ${API_BASE}. Make sure uvicorn is running on port 8000.` }]);
    });
  }, []);

  useEffect(()=>{ msgEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages, chatLoading]);

  const sendMessage = useCallback(async (text) => {
    const msg = (text||input).trim();
    if (!msg||chatLoading) return;
    setInput('');
    setMessages(prev=>[...prev,{role:'user',content:msg}]);
    setChatLoading(true);
    const newHist = [...history,{role:'user',content:msg}];
    try {
      const res = await fetch(`${API_BASE}/chat`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message:msg,history}) });
      const data = await res.json();
      if (data.type==='off_topic') {
        setMessages(prev=>[...prev,{role:'bot',off_topic:true,content:data.message}]);
      } else if (data.type==='answer') {
        setMessages(prev=>[...prev,{role:'bot',content:data.answer,sql:data.sql,data:data.data,columns:data.columns,rowCount:data.row_count}]);
        setHistory([...newHist,{role:'assistant',content:data.answer}]);
        if (data.data?.length) {
          const ids = new Set();
          data.data.forEach(row=>Object.values(row).forEach(v=>{ if(typeof v==='string') graphData.nodes.forEach(n=>{ if(n.id.includes(v)) ids.add(n.id); }); }));
          if (ids.size) { setHighlightIds(ids); setTimeout(()=>setHighlightIds(new Set()),8000); }
        }
      } else {
        setMessages(prev=>[...prev,{role:'bot',error:true,content:data.message||'Unknown error.'}]);
      }
    } catch {
      setMessages(prev=>[...prev,{role:'bot',error:true,content:'Request failed. Check backend is running.'}]);
    } finally { setChatLoading(false); }
  }, [input,chatLoading,history,graphData.nodes]);

  const handleKeyDown = e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} };

  const handleNodeClick = useCallback(async node=>{
    setSelectedNode(node.id);
    try { const res=await fetch(`${API_BASE}/graph/node/${node.id}`); setNodeDetail({node,data:await res.json()}); }
    catch { setNodeDetail({node,data:{}}); }
  },[]);

  const handleNodeHover = useCallback((node,_,ev)=>{
    if(node) setTooltip({node,pos:{x:ev?.clientX||400,y:ev?.clientY||300}});
    else setTooltip({node:null,pos:null});
  },[]);

  const filteredGraph = React.useMemo(()=>{
    let nodes=graphData.nodes, links=graphData.links;
    if(filterType!=='all'){
      const keep=new Set(nodes.filter(n=>n.type===filterType).map(n=>n.id));
      links=links.filter(l=>{ const s=typeof l.source==='object'?l.source.id:l.source, t=typeof l.target==='object'?l.target.id:l.target; return keep.has(s)||keep.has(t); });
      links.forEach(l=>{ keep.add(typeof l.source==='object'?l.source.id:l.source); keep.add(typeof l.target==='object'?l.target.id:l.target); });
      nodes=nodes.filter(n=>keep.has(n.id));
    }
    if(search.trim()){
      const q=search.toLowerCase();
      const keep=new Set(nodes.filter(n=>n.label.toLowerCase().includes(q)||n.id.toLowerCase().includes(q)).map(n=>n.id));
      if(keep.size){
        links=links.filter(l=>{ const s=typeof l.source==='object'?l.source.id:l.source,t=typeof l.target==='object'?l.target.id:l.target; return keep.has(s)||keep.has(t); });
        nodes=nodes.filter(n=>keep.has(n.id));
      }
    }
    return {nodes,links};
  },[graphData,filterType,search]);

  const nodeCanvasObject = useCallback((node,ctx,scale)=>{
    const color=NODE_COLORS[node.type]||'#8b9ab8';
    const base=NODE_SIZES[node.type]||4;
    const isSel=selectedNode===node.id, isHL=highlightIds.has(node.id);
    const size=base*(isSel?2:isHL?1.6:1);
    if(isSel||isHL){
      ctx.beginPath(); ctx.arc(node.x,node.y,size+5,0,2*Math.PI);
      ctx.fillStyle=color+'22'; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(node.x,node.y,size,0,2*Math.PI);
    ctx.fillStyle=isSel?'#fff':color; ctx.fill();
    if(node.type==='Customer'||isSel||isHL){
      ctx.strokeStyle=color; ctx.lineWidth=isSel?2.5:1.5; ctx.stroke();
    }
    if(scale>2.5||node.type==='Customer'||isSel){
      ctx.font=`${node.type==='Customer'?9:7}px DM Sans`;
      ctx.fillStyle=isSel?'#fff':'rgba(232,234,240,0.8)';
      ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.fillText(node.label,node.x,node.y+size+2);
    }
  },[selectedNode,highlightIds]);

  const FILTERS=['all','SalesOrder','Delivery','Billing','JournalEntry','Customer'];
  const FL={ all:'All',SalesOrder:'Orders',Delivery:'Delivery',Billing:'Billing',JournalEntry:'Journal',Customer:'Customers' };

  return (
    <div className="app">
      {/* NAV */}
      <nav className="topnav">
        <div style={{ display:'flex',alignItems:'center',gap:16 }}>
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <div style={{ width:34,height:34,borderRadius:9,background:'linear-gradient(135deg,#4f9cf9,#7c6af7)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:700,fontFamily:'var(--mono)',color:'white' }}>O</div>
            <div>
              <div style={{ fontSize:13,fontWeight:700,fontFamily:'var(--mono)',letterSpacing:1,color:'var(--text)' }}>O2C Explorer</div>
              <div style={{ fontSize:10,color:'var(--text3)',marginTop:1 }}>Order to Cash · Graph System</div>
            </div>
          </div>
          <div style={{ width:1,height:32,background:'var(--border)' }}/>
          <div style={{ fontSize:11,color:'var(--text3)',display:'flex',gap:6,alignItems:'center' }}>
            <span style={{ width:6,height:6,borderRadius:'50%',background:'var(--green)',display:'inline-block',animation:'pulse 2s infinite' }}/>
            {filteredGraph.nodes.length} nodes · {filteredGraph.links.length} edges
          </div>
        </div>
        <div style={{ display:'flex',gap:8,alignItems:'center' }}>
          {[
            {label:'Sales Orders',val:stats.sales_orders, color:'#4f9cf9',icon:'📋'},
            {label:'Deliveries',  val:stats.deliveries,   color:'#3dd68c',icon:'📦'},
            {label:'Invoices',    val:stats.billing_docs, color:'#f7c94f',icon:'🧾'},
            {label:'Payments',    val:stats.payments,     color:'#f97b4f',icon:'💳'},
            {label:'Customers',   val:stats.customers,    color:'#c97bf7',icon:'👤'},
          ].map(s=><StatCard key={s.label} {...s}/>)}
        </div>
      </nav>

      <div className="main">
        {/* GRAPH */}
        <div className="graph-area">
          {loading ? (
            <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,background:'var(--bg)' }}>
              <div className="spinner"/>
              <div style={{ fontFamily:'var(--mono)',fontSize:12,color:'var(--text3)' }}>Loading graph…</div>
            </div>
          ) : (
            <>
              <ForceGraph2D
                ref={graphRef}
                graphData={filteredGraph}
                nodeCanvasObject={nodeCanvasObject}
                nodeCanvasObjectMode={()=>'replace'}
                linkColor={l=>{ const lb=l.label||''; if(lb==='PLACED_ORDER') return 'rgba(201,123,247,0.2)'; if(lb==='DELIVERED_VIA') return 'rgba(61,214,140,0.2)'; if(lb==='BILLED_AS') return 'rgba(247,201,79,0.2)'; if(lb==='JOURNAL_ENTRY') return 'rgba(249,123,79,0.2)'; return 'rgba(79,156,249,0.15)'; }}
                linkWidth={1}
                backgroundColor="#0a0c10"
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                cooldownTicks={100}
                d3AlphaDecay={0.02}
                enableNodeDrag
              />
              <Tooltip node={tooltip.node} pos={tooltip.pos}/>
              <NodeDetail detail={nodeDetail} onClose={()=>{setNodeDetail(null);setSelectedNode(null);}}/>

              {/* Left controls */}
              <div style={{ position:'absolute',top:16,left:16,display:'flex',flexDirection:'column',gap:8,zIndex:50 }}>
                <div style={{ position:'relative' }}>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search nodes…"
                    style={{ padding:'7px 12px 7px 30px',background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:12,fontFamily:'var(--body)',outline:'none',width:180 }}/>
                  <span style={{ position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',fontSize:13,pointerEvents:'none' }}>🔍</span>
                </div>
                <div style={{ display:'flex',flexWrap:'wrap',gap:5,maxWidth:200 }}>
                  {FILTERS.map(f=>(
                    <button key={f} onClick={()=>setFilterType(f)} style={{
                      padding:'5px 10px',borderRadius:20,fontSize:10,fontFamily:'var(--mono)',cursor:'pointer',transition:'all 0.15s',
                      border:filterType===f?`1px solid ${NODE_COLORS[f]||'var(--accent)'}`:'1px solid var(--border)',
                      background:filterType===f?`${NODE_COLORS[f]||'var(--accent)'}22`:'var(--bg2)',
                      color:filterType===f?(NODE_COLORS[f]||'var(--accent)'):'var(--text3)',
                    }}>{FL[f]}</button>
                  ))}
                </div>
                <button onClick={()=>graphRef.current?.zoomToFit(500)} style={{ padding:'6px 12px',borderRadius:8,fontSize:11,fontFamily:'var(--mono)',cursor:'pointer',border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text3)',transition:'all 0.15s',textAlign:'left' }}>⊡ Fit View</button>
                {highlightIds.size>0 && <div style={{ padding:'6px 10px',background:'rgba(79,156,249,0.1)',border:'1px solid rgba(79,156,249,0.3)',borderRadius:8,fontSize:11,color:'var(--accent)' }}>✨ {highlightIds.size} nodes highlighted</div>}
              </div>

              {/* Legend */}
              <div style={{ position:'absolute',bottom:20,left:16,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 16px' }}>
                <div style={{ fontSize:9,letterSpacing:'1.5px',textTransform:'uppercase',color:'var(--text3)',fontFamily:'var(--mono)',marginBottom:8 }}>Entity Types</div>
                {Object.entries(NODE_COLORS).map(([type,color])=>(
                  <div key={type} style={{ display:'flex',alignItems:'center',gap:8,marginBottom:5 }}>
                    <div style={{ width:9,height:9,borderRadius:'50%',background:color }}/>
                    <span style={{ fontSize:11,color:'var(--text2)' }}>{type}</span>
                  </div>
                ))}
              </div>

              {/* Revenue badge */}
              {stats.total_revenue && (
                <div style={{ position:'absolute',bottom:20,right:16,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 16px' }}>
                  <div style={{ fontSize:9,letterSpacing:'1.5px',textTransform:'uppercase',color:'var(--text3)',fontFamily:'var(--mono)',marginBottom:4 }}>Total Revenue</div>
                  <div style={{ fontSize:22,fontWeight:700,fontFamily:'var(--mono)',color:'var(--green)' }}>₹{Number(stats.total_revenue).toLocaleString('en-IN')}</div>
                  {stats.broken_flows>0 && <div style={{ fontSize:11,color:'#f97b4f',marginTop:4 }}>⚠️ {stats.broken_flows} broken flows</div>}
                </div>
              )}
            </>
          )}
        </div>

        {/* SIDE PANEL */}
        <div className="side-panel">
          <div style={{ padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:14,fontWeight:700 }}>Chat with Graph</div>
              <div style={{ fontSize:11,color:'var(--text3)',marginTop:2 }}>Ask questions in plain English</div>
            </div>
            <div style={{ display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--green)',fontFamily:'var(--mono)' }}>
              <span style={{ width:6,height:6,borderRadius:'50%',background:'var(--green)',display:'inline-block',animation:'pulse 2s infinite' }}/>Graph Agent
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex',borderBottom:'1px solid var(--border)' }}>
            {['chat','flow','about'].map(t=>(
              <div key={t} onClick={()=>setTab(t)} style={{ flex:1,padding:'9px',textAlign:'center',fontSize:11,color:tab===t?'var(--accent)':'var(--text3)',cursor:'pointer',borderBottom:tab===t?'2px solid var(--accent)':'2px solid transparent',fontFamily:'var(--mono)',textTransform:'uppercase',letterSpacing:'0.5px',transition:'all 0.15s' }}>{t}</div>
            ))}
          </div>

          {/* CHAT */}
          {tab==='chat' && (
            <>
              <div className="messages">
                {messages.map((m,i)=><ChatMsg key={i} msg={m} onSample={sendMessage}/>)}
                {chatLoading && <Typing/>}
                <div ref={msgEndRef}/>
              </div>
              <div style={{ padding:'12px 16px',borderTop:'1px solid var(--border)' }}>
                <div style={{ display:'flex',gap:8 }}>
                  <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="Ask about orders, deliveries, billing…" disabled={chatLoading} rows={1}
                    style={{ flex:1,padding:'10px 14px',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:10,color:'var(--text)',fontSize:13,fontFamily:'var(--body)',resize:'none',outline:'none',transition:'border-color 0.2s',minHeight:40,maxHeight:120,lineHeight:1.4 }}
                    onFocus={e=>e.target.style.borderColor='var(--accent)'}
                    onBlur={e=>e.target.style.borderColor='var(--border)'}
                  />
                  <button onClick={()=>sendMessage()} disabled={chatLoading||!input.trim()} style={{ width:40,height:40,borderRadius:10,border:'none',background:chatLoading||!input.trim()?'var(--bg3)':'var(--accent)',cursor:chatLoading||!input.trim()?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s',flexShrink:0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M2 21L23 12 2 3v7l15 2-15 2v7z"/></svg>
                  </button>
                </div>
                <div style={{ fontSize:10,color:'var(--text3)',marginTop:6,fontFamily:'var(--mono)' }}>Enter to send · Shift+Enter for new line</div>
              </div>
            </>
          )}

          {/* FLOW */}
          {tab==='flow' && (
            <div style={{ padding:20,flex:1,overflowY:'auto' }}>
              <div style={{ fontSize:10,letterSpacing:'1.5px',color:'var(--text3)',fontFamily:'var(--mono)',textTransform:'uppercase',marginBottom:16 }}>Order to Cash Process</div>
              {[
                {n:1,type:'Customer',    label:'Customer',          color:'#c97bf7',desc:'Business partner who places the order.'},
                {n:2,type:'SalesOrder',  label:'Sales Order',       color:'#4f9cf9',desc:'Customer order. Links to products, delivery, and payment terms.'},
                {n:3,type:'Delivery',    label:'Outbound Delivery', color:'#3dd68c',desc:'Physical shipment of goods. References sales order items.'},
                {n:4,type:'Billing',     label:'Billing Document',  color:'#f7c94f',desc:'Invoice created post-delivery. Has line items per product.'},
                {n:5,type:'JournalEntry',label:'Journal Entry',     color:'#f97b4f',desc:'Accounting entry created by billing. Tracks receivables.'},
              ].map((step,i,arr)=>(
                <div key={step.type} style={{ display:'flex',gap:12,marginBottom:4,position:'relative' }}>
                  <div style={{ display:'flex',flexDirection:'column',alignItems:'center' }}>
                    <div style={{ width:34,height:34,borderRadius:'50%',flexShrink:0,background:`${step.color}22`,border:`2px solid ${step.color}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,fontFamily:'var(--mono)',color:step.color }}>{step.n}</div>
                    {i<arr.length-1 && <div style={{ width:2,height:28,background:'var(--border)',marginTop:2 }}/>}
                  </div>
                  <div style={{ paddingBottom:20 }}>
                    <div style={{ fontSize:13,fontWeight:600,color:step.color,marginBottom:3 }}>{step.label}</div>
                    <div style={{ fontSize:12,color:'var(--text2)',lineHeight:1.5 }}>{step.desc}</div>
                  </div>
                </div>
              ))}
              <div style={{ marginTop:8,padding:14,background:'var(--bg3)',borderRadius:10,border:'1px solid var(--border)' }}>
                <div style={{ fontSize:10,letterSpacing:'1.5px',color:'var(--text3)',fontFamily:'var(--mono)',textTransform:'uppercase',marginBottom:10 }}>Live Stats</div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 }}>
                  {[['Revenue',`₹${Number(stats.total_revenue||0).toLocaleString('en-IN')}`],['Broken Flows',stats.broken_flows||0],['Products',stats.products||0],['Customers',stats.customers||0]].map(([k,v])=>(
                    <div key={k} style={{ padding:'8px 10px',background:'var(--bg2)',borderRadius:8,border:'1px solid var(--border)' }}>
                      <div style={{ fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)' }}>{k}</div>
                      <div style={{ fontSize:16,fontWeight:700,color:'var(--text)',fontFamily:'var(--mono)',marginTop:2 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ABOUT */}
          {tab==='about' && (
            <div style={{ padding:20,flex:1,overflowY:'auto' }}>
              <div style={{ fontSize:10,letterSpacing:'1.5px',color:'var(--text3)',fontFamily:'var(--mono)',textTransform:'uppercase',marginBottom:16 }}>About This System</div>
              {[
                {icon:'🗄️',title:'Database',desc:'SQLite with 11 tables covering the full SAP O2C process. Pre-loaded from raw JSONL dataset.'},
                {icon:'🧠',title:'LLM Integration',desc:'Groq Llama 3.3 70B converts natural language to SQL, then formats results into plain English.'},
                {icon:'🛡️',title:'Guardrails',desc:'Off-topic queries are blocked by the LLM. SQL injection prevented. Only SELECT allowed.'},
                {icon:'📊',title:'Graph Model',desc:'Force-directed graph with 5 entity types. Edges represent real FK joins between tables.'},
                {icon:'💬',title:'Memory',desc:'Last 6 turns of conversation sent as context for natural follow-up questions.'},
                {icon:'✨',title:'Node Highlighting',desc:'Nodes referenced in query results are automatically highlighted on the graph.'},
              ].map(item=>(
                <div key={item.title} style={{ marginBottom:12,padding:'12px 14px',background:'var(--bg3)',borderRadius:10,border:'1px solid var(--border)' }}>
                  <div style={{ fontSize:13,fontWeight:600,marginBottom:4 }}>{item.icon} {item.title}</div>
                  <div style={{ fontSize:12,color:'var(--text2)',lineHeight:1.6 }}>{item.desc}</div>
                </div>
              ))}
              <div style={{ fontSize:11,color:'var(--text3)',lineHeight:1.7,marginTop:8,padding:'10px 14px',background:'var(--bg3)',borderRadius:8,border:'1px solid var(--border)' }}>
                <strong style={{ color:'var(--text2)' }}>Stack:</strong> FastAPI · SQLite · React 18 · react-force-graph-2d · Groq API (Llama 3.3 70B)
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}