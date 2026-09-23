const express=require('express');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const app=express();
app.use(express.json({limit:'1mb'}));
app.use(express.static(path.join(__dirname,'public')));

const DATA=path.join(__dirname,'data.json');
const QUESTIONS=[{"id": 1, "type": "mc", "text": "Was ist die Hauptaufgabe eines Zugführers?", "options": ["Einen Zug führen und die Einsatzkräfte koordinieren.", "Nur selbst Aufgaben ausführen.", "Den Einsatz ignorieren."], "correct": 0}, {"id": 2, "type": "mc", "text": "Was sollte ein Zugführer vor einer Entscheidung zuerst machen?", "options": ["Die Lage anschauen und einschätzen.", "Ohne Informationen handeln.", "Sofort den Einsatz beenden."], "correct": 0}, {"id": 3, "type": "mc", "text": "Was ist bei Befehlen besonders wichtig?", "options": ["Sie sollen klar, kurz und verständlich sein.", "Sie sollen möglichst kompliziert sein.", "Es ist egal, ob sie verstanden werden."], "correct": 0}, {"id": 4, "type": "mc", "text": "Was gehört zu einer guten Funkmeldung?", "options": ["Kurz und deutlich wichtige Informationen weitergeben.", "Den Funk unnötig lange blockieren.", "Keine Rückmeldung geben."], "correct": 0}, {"id": 5, "type": "mc", "text": "Was machst du, wenn sich die Einsatzlage plötzlich verändert?", "options": ["Lage neu bewerten und die Maßnahmen anpassen.", "Die Veränderung ignorieren.", "Den Funk ausschalten."], "correct": 0}, {"id": 6, "type": "mc", "text": "Warum sind Rückmeldungen der Einsatzkräfte wichtig?", "options": ["Damit der Zugführer weiß, wie sich die Lage entwickelt.", "Sie sind grundsätzlich unwichtig.", "Nur der Ausbilder darf Rückmeldungen bekommen."], "correct": 0}, {"id": 7, "type": "text", "text": "Nenne zwei Aufgaben eines Zugführers."}, {"id": 8, "type": "text", "text": "Du benötigst weitere Kräfte. Was machst du?"}, {"id": 9, "type": "text", "text": "Ein Trupp meldet ein Problem. Wie reagierst du?"}, {"id": 10, "type": "text", "text": "Erkläre den Merksatz: „Lage verstehen – Kräfte einteilen – Befehle geben – Kontrollieren.“"}];
const PASS=15;
const ADMIN_USER='ausbilder';
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'feuerwehr2026';
const sessions=new Set();
let db=fs.existsSync(DATA)?JSON.parse(fs.readFileSync(DATA,'utf8')):{attempts:[],codes:['ZF-2026']};

function save(){fs.writeFileSync(DATA,JSON.stringify(db,null,2));}
function auth(req,res,next){const h=req.headers.authorization||'';const t=h.replace('Bearer ','');if(!sessions.has(t))return res.status(401).json({error:'Nicht angemeldet'});next();}
function cleanQuestions(){return QUESTIONS.map(q=>q.type==='mc'?{id:q.id,type:q.type,text:q.text,options:q.options}:{id:q.id,type:q.type,text:q.text});}
function scoreAttempt(a){
 let auto=0, manual=0, hasManual=false;
 a.answers.forEach(x=>{const q=QUESTIONS.find(q=>q.id===x.questionId);if(!q)return;if(q.type==='mc'){x.points=Number(x.value)===q.correct?2:0;auto+=x.points}else if(typeof x.points==='number'){manual+=x.points;hasManual=true}});
 a.autoScore=auto;a.manualScore=hasManual?manual:null;a.score=hasManual?auto+manual:null;
 a.status=a.score===null?'Ausstehend':(a.score>=PASS?'Bestanden':'Nicht bestanden');
}
app.post('/api/login',(req,res)=>{if(req.body.username!==ADMIN_USER||req.body.password!==ADMIN_PASSWORD)return res.status(401).json({error:'Ungültige Zugangsdaten'});const t=crypto.randomBytes(24).toString('hex');sessions.add(t);res.json({token:t});});
app.post('/api/attempts',(req,res)=>{
 const {name,code}=req.body;if(!name||!code)return res.status(400).json({error:'Name und Prüfungscode erforderlich'});if(!db.codes.includes(code))return res.status(403).json({error:'Ungültiger Prüfungscode'});
 const a={id:crypto.randomUUID(),name,code,date:new Date().toISOString(),answers:[],submitted:false,autoScore:0,manualScore:null,score:null,status:'In Bearbeitung'};
 db.attempts.push(a);save();res.json({id:a.id,questions:cleanQuestions()});
});
app.post('/api/attempts/:id/submit',(req,res)=>{
 const a=db.attempts.find(x=>x.id===req.params.id);if(!a)return res.status(404).json({error:'Nicht gefunden'});if(a.submitted)return res.status(400).json({error:'Bereits abgegeben'});
 a.answers=(req.body.answers||[]).map(x=>({questionId:Number(x.questionId),value:String(x.value??'')}));a.submitted=true;scoreAttempt(a);save();res.json({id:a.id,autoScore:a.autoScore});
});
app.get('/api/attempts',auth,(req,res)=>res.json(db.attempts.filter(a=>a.submitted).map(a=>({id:a.id,name:a.name,date:new Date(a.date).toLocaleString('de-DE'),score:a.score,status:a.status}))));
app.get('/api/attempts/:id',auth,(req,res)=>{
 const a=db.attempts.find(x=>x.id===req.params.id);if(!a)return res.status(404).json({error:'Nicht gefunden'});
 res.json({...a,answers:a.answers.map(x=>{const q=QUESTIONS.find(q=>q.id===x.questionId);return {...x,text:q?.text||'',type:q?.type||'text'}})});
});
app.post('/api/attempts/:id/grade',auth,(req,res)=>{
 const a=db.attempts.find(x=>x.id===req.params.id);if(!a)return res.status(404).json({error:'Nicht gefunden'});
 for(const g of (req.body.grades||[])){const x=a.answers.find(x=>x.questionId===Number(g.questionId));const q=QUESTIONS.find(q=>q.id===Number(g.questionId));if(x&&q?.type==='text')x.points=Math.max(0,Math.min(2,Number(g.points)||0));}
 scoreAttempt(a);save();res.json({message:'Bewertung gespeichert',score:a.score,status:a.status});
});
app.post('/api/exam-codes',auth,(req,res)=>{const c=String(req.body.code||'').trim();if(!c)return res.status(400).json({error:'Code fehlt'});if(!db.codes.includes(c))db.codes.push(c);save();res.json({message:'Prüfungscode gespeichert'});});
app.get('/api/export.csv',auth,(req,res)=>{
 const rows=[['ID','Name','Datum','Automatisch','Freitext','Gesamt','Status']];
 db.attempts.filter(a=>a.submitted).forEach(a=>rows.push([a.id,a.name,a.date,a.autoScore,a.manualScore??'',a.score??'',a.status]));
 const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
 res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="pruefungsergebnisse.csv"');res.send('\ufeff'+csv);
});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
const port=process.env.PORT||3000;app.listen(port,()=>console.log('Prüfungsplattform läuft auf Port '+port));
