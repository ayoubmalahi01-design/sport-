import React, { useMemo, useState, useEffect } from 'react'
import AuthPage from './components/AuthPage.jsx'
import BulkStudentsImport from './components/BulkStudentsImport.jsx'
import BulkResultsImport from './components/BulkResultsImport.jsx'
import BarmeEditor from './components/BarmeEditor.jsx'
import AttendanceBatch from './components/AttendanceBatch.jsx'
import ConflictCenter from './components/ConflictCenter.jsx'
import AccountRequestsPanel from './components/AccountRequestsPanel.jsx'
import { mirrorToIDB } from './lib/storage.js'
import * as AuthService from './services/auth.service.js'
import {
  Activity, Users, ClipboardCheck, CalendarDays, NotebookPen, Dumbbell,
  LayoutDashboard, Settings, FileText, ShieldCheck, Search, Bell, Plus,
  ChevronLeft, Menu, X, TrendingUp, UserRound, Clock3, AlertCircle,
  CheckCircle2, CircleHelp, HeartPulse, ClipboardList, LogOut, Filter,
  Download, MoreHorizontal, CalendarCheck, UserCheck, UserX, Pencil,
  Save, Trash2, Building2, ArrowUpRight
} from 'lucide-react'

const initialStudents = [
  {id:'SP-001', name:'محمد أمين بن سالم', age:19, group:'المجموعة A', status:'نشط', attendance:94, average:16.5, last:'2026-11-04'},
  {id:'SP-002', name:'يوسف العياري', age:20, group:'المجموعة A', status:'نشط', attendance:88, average:14.2, last:'2026-11-04'},
  {id:'SP-003', name:'سيف الدين الغربي', age:18, group:'المجموعة B', status:'نشط', attendance:76, average:12.8, last:'2026-11-03'},
  {id:'SP-004', name:'أنس الماجري', age:21, group:'المجموعة B', status:'متوقف مؤقتًا', attendance:81, average:13.7, last:'2026-10-30'},
  {id:'SP-005', name:'بلال الطرابلسي', age:19, group:'المجموعة A', status:'نشط', attendance:97, average:17.1, last:'2026-11-05'},
]
const nav = [
  ['الرئيسية','dashboard',LayoutDashboard],['التلاميذ','students',Users],['المتابعة','tracking',Activity],
  ['الحضور والغيابات','attendance',CalendarCheck],['الاختبارات','tests',Dumbbell],['النتائج والمعدلات','results',ClipboardCheck],
  ['سجل الحصص','sessions',Clock3],['كراس المدرب الخاص','notebook',NotebookPen],['الإصابات','injuries',HeartPulse],
  ['سجل التعديلات','audit',ShieldCheck],['التقارير','reports',FileText],['الإعدادات','settings',Settings]
]
const today = new Date().toISOString().slice(0,10)

function read(key, fallback){try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback}}
function App(){
  const [page,setPage]=useState('dashboard')
  const [showBulkStudents,setShowBulkStudents]=useState(false)
  const [showBulkResults,setShowBulkResults]=useState(false)
  const [showBarmeEditor,setShowBarmeEditor]=useState(false)
  const [showAttendanceBatch,setShowAttendanceBatch]=useState(false)
  const [mobile,setMobile]=useState(false)
  const [students,setStudents]=useState(()=>read('sp_students',initialStudents))
  const [attendance,setAttendance]=useState(()=>read('sp_attendance',[]))
  const [notes,setNotes]=useState(()=>read('sp_private_notes',[]))
  const [search,setSearch]=useState('')
  const [showAdd,setShowAdd]=useState(false)
  const [newName,setNewName]=useState('')
  const [newId,setNewId]=useState('')
  const [newGroup,setNewGroup]=useState('المجموعة A')
  const [noteText,setNoteText]=useState('')
  const [notice,setNotice]=useState('')
  const [filterGroup,setFilterGroup]=useState('الكل')
  const [authUser,setAuthUser]=useState(null)
  const [authProfile,setAuthProfile]=useState(null)
  const [authLoading,setAuthLoading]=useState(true)
  const [authError,setAuthError]=useState('')
  const role = authProfile?.role || (AuthService.isAuthAvailable() ? null : 'admin')
  const institutionId = authProfile?.institution_id || null
  const [institution,setInstitution]=useState('المؤسسة الرياضية النموذجية')
  const [logo,setLogo]=useState('')
  const [selectedStudent,setSelectedStudent]=useState(null)
  const [attendanceDate,setAttendanceDate]=useState(today)
  const [test,setTest]=useState('Pompes')
  const [testValue,setTestValue]=useState('')
  const [resultStudent,setResultStudent]=useState('SP-001')
  const [sessionStarted,setSessionStarted]=useState(false)
  const [sessionStart,setSessionStart]=useState('')
  const [sessionEnd,setSessionEnd]=useState('')
  const [audit,setAudit]=useState(()=>read('sp_audit',[]))
  const [absReason,setAbsReason]=useState('غياب عادي')

  const persist=(key,val)=>{localStorage.setItem(key,JSON.stringify(val));mirrorToIDB(key,val).catch(()=>{})}
  const log=(action,detail,entityType='unknown',entityId=null)=>{const item={id:Date.now(),action,detail,by:authUser?.email||'local',at:new Date().toLocaleString('ar-TN'),institution_id:institutionId||'local',actor_id:authUser?.id||'local',entity_type:entityType,entity_id:entityId,reason:detail};const next=[item,...audit];setAudit(next);persist('sp_audit',next)}
  const flash=(msg)=>{setNotice(msg);setTimeout(()=>setNotice(''),2600)}
  const saveStudents=(v)=>{setStudents(v);persist('sp_students',v)}
  const filtered=useMemo(()=>students.filter(s=>(s.name.includes(search)||s.id.toLowerCase().includes(search.toLowerCase()))&&(filterGroup==='الكل'||s.group===filterGroup)),[students,search,filterGroup])
  const mark=(studentId,status,reason='')=>{
    const item={id:Date.now(),studentId,status,reason,date:attendanceDate,by:'حساب العرض الحالي'}
    const next=[item,...attendance];setAttendance(next);persist('sp_attendance',next);log('تسجيل حضور/غياب',`${studentId} — ${status}${reason?' — '+reason:''}`);flash('تم حفظ التسجيل التجريبي')
  }
  const addStudent=()=>{
    if(!newName.trim()||!newId.trim())return flash('أدخل اسم التلميذ ورقمه')
    if(students.some(s=>s.id===newId.trim()))return flash('رقم التلميذ موجود مسبقاً')
    const v=[...students,{id:newId.trim(),name:newName.trim(),age:'—',group:newGroup,status:'نشط',attendance:100,average:'—',last:today}]
    saveStudents(v);log('إضافة تلميذ',`${newName} (${newId})`);setShowAdd(false);setNewName('');setNewId('');flash('تمت إضافة التلميذ')
  }
  const addNote=()=>{if(!noteText.trim())return;const v=[{id:Date.now(),text:noteText.trim(),date:new Date().toLocaleString('ar-TN')} ,...notes];setNotes(v);persist('sp_private_notes',v);setNoteText('');flash('تم حفظ الملاحظة في كراسك الخاص')}
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      setAuthLoading(true);
      const { session, user } = await AuthService.getSession();
      if (user) {
        const profile = await AuthService.getProfile(user.id);
        if (profile) {
          setAuthUser(user);
          setAuthProfile(profile);
        } else {
          setAuthError('الملف الشخصي غير موجود — تواصل مع المسؤول');
        }
      }
      setAuthLoading(false);
      unsub = AuthService.onAuthStateChange(async (u) => {
        if (!u) { setAuthUser(null); setAuthProfile(null); return; }
        setAuthUser(u);
        const p = await AuthService.getProfile(u.id);
        if (p) setAuthProfile(p); else setAuthError('الملف الشخصي غير موجود');
      });
    })();
    return () => unsub();
  }, []);
  const presentToday=attendance.filter(a=>a.date===attendanceDate&&a.status==='حاضر').length
  const absentToday=attendance.filter(a=>a.date===attendanceDate&&a.status==='غائب').length
  const pageTitle=nav.find(n=>n[1]===page)?.[0]||'الرئيسية'

  if (authLoading && AuthService.isAuthAvailable()) {
    return <div className="app-shell"><section className="panel"><div className="panel-head"><h2>جارٍ التحقق من الجلسة...</h2></div></section></div>
  }
  if (AuthService.isAuthAvailable() && (!authUser || !authProfile || (authProfile.status && authProfile.status !== 'approved'))) {
    return <AuthPage onAuthed={(u, p) => { setAuthUser(u); setAuthProfile(p); setAuthError(''); }} flash={flash} />
  }
  if (authError) {
    return <div className="app-shell"><section className="panel"><div className="panel-head"><h2>خطأ في المصادقة</h2><p>{authError}</p></div><button className="btn btn-primary" onClick={() => { AuthService.signOut(); setAuthUser(null); setAuthProfile(null); setAuthError(''); }}>تسجيل خروج</button></section></div>
  }
  return <div className="app-shell">
    <aside className={`sidebar ${mobile?'open':''}`}>
      <div className="brand"><div className="brand-mark"><Activity size={23}/></div><div><b>SPORT</b><span>PERFORMANCE</span></div><button className="close-mobile" onClick={()=>setMobile(false)}><X/></button></div>
      <div className="institution-mini"><div className="inst-logo">{logo?<img src={logo}/>:<Building2 size={19}/>}</div><div><small>المؤسسة الحالية</small><b>{institution}</b></div></div>
      <div className="nav-label">القائمة الرئيسية</div>
      <nav>{nav.map(([label,id,Icon])=><button key={id} className={`nav-link ${page===id?'active':''}`} onClick={()=>{setPage(id);setMobile(false)}}><Icon size={18}/><span>{label}</span>{id==='attendance'&&<i className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="secure"><ShieldCheck size={17}/><span>secure</span></div><div className="profile-mini"><div className="avatar">{(authProfile && authProfile.full_name ? authProfile.full_name : (authUser && authUser.email ? authUser.email : "?")).slice(0,1)}</div><div><b>{authProfile && authProfile.full_name ? authProfile.full_name : (authUser && authUser.email ? authUser.email : "ضيف")}</b><small>{role || "—"}{institutionId ? " · " + String(institutionId).slice(0,8) : ""}</small></div><button title="logout" onClick={async function(){ await AuthService.signOut(); setAuthUser(null); setAuthProfile(null); }}>تسجيل خروج</button></div></div>
    </aside>
    {mobile&&<div className="scrim" onClick={()=>setMobile(false)}/>}
    <main className="main">
      <header className="topbar"><div className="top-left"><button className="menu-btn" onClick={()=>setMobile(true)}><Menu/></button><div className="crumb">لوحة التحكم <ChevronLeft size={14}/><b>{pageTitle}</b></div></div><div className="top-actions"><div className="date-chip"><CalendarDays size={15}/>{new Date().toLocaleDateString('ar-TN',{weekday:'long',day:'numeric',month:'long'})}</div><button className="icon-btn" title="الإشعارات"><Bell size={18}/><i/></button><div className="top-avatar">ع</div></div></header>
      <div className="content">
        <div className="welcome-row"><div><div className="eyebrow">SPORT PERFORMANCE / إدارة الأداء الرياضي</div><h1>{page==='dashboard'?'مرحبًا بك، أيوب':pageTitle}</h1><p>{page==='dashboard'?'نظرة شاملة على التلاميذ، الحضور، والنتائج الرياضية.':'إدارة ومتابعة بيانات المؤسسة الرياضية من مساحة واحدة.'}</p></div><div className="welcome-actions"><button className="btn btn-ghost" onClick={()=>setPage('reports')}><Download size={16}/> التقارير</button><button className="btn btn-primary" onClick={()=>{setPage('students');setShowAdd(true)}}><Plus size={17}/> إضافة تلميذ</button></div></div>
        {page==='dashboard'&&<Dashboard students={students} attendance={attendance} setPage={setPage} />}
        {page==='students'&&<section className="panel"><div className="panel-head"><div><h2>قائمة التلاميذ</h2><p>قاعدة بيانات التلاميذ المسجلين في المؤسسة</p></div><button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={16}/> تلميذ جديد</button><button className="btn btn-ghost" onClick={()=>setShowBulkStudents(v=>!v)}>استيراد جماعي</button></div>{showBulkStudents&&<BulkStudentsImport students={students} setStudents={saveStudents} flash={flash}/>}<div className="toolbar"><div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث بالاسم أو رقم التلميذ..."/></div><select value={filterGroup} onChange={e=>setFilterGroup(e.target.value)}><option>الكل</option><option>المجموعة A</option><option>المجموعة B</option></select></div><StudentsTable students={filtered} onSelect={s=>{setSelectedStudent(s);setPage('tracking')}} /></section>}
        {page==='tracking'&&<Tracking students={students} attendance={attendance} selected={selectedStudent} onSelect={setSelectedStudent}/>}
        {page==='attendance'&&<><div className="action-row" style={{marginBottom:8}}><button className="btn btn-ghost" onClick={()=>setShowAttendanceBatch(v=>!v)}>تسجيل حضور جماعي</button></div>{showAttendanceBatch&&<AttendanceBatch students={students} attendanceDate={attendanceDate} setAttendance={setAttendance} flash={flash}/>}<section className="panel"><div className="panel-head"><div><h2>الحضور والغيابات</h2><p>تسجيل يومي ومتابعة لكل تلميذ</p></div><input type="date" value={attendanceDate} onChange={e=>setAttendanceDate(e.target.value)} className="date-input"/></div><div className="attendance-summary"><MiniStat label="الحاضرون اليوم" value={presentToday} icon={UserCheck} color="green"/><MiniStat label="الغائبون اليوم" value={absentToday} icon={UserX} color="red"/><MiniStat label="عدد التلاميذ" value={students.length} icon={Users}/></div><div className="attendance-tip"><AlertCircle size={17}/> اختر حالة كل تلميذ. يتم حفظ السجل بتاريخ اليوم المختار ويظهر في بطاقة المتابعة.</div><div className="table-wrap"><table><thead><tr><th>التلميذ</th><th>رقم التلميذ</th><th>المجموعة</th><th>الحالة</th><th>تسجيل</th></tr></thead><tbody>{students.map(s=>{const rec=attendance.find(a=>a.studentId===s.id&&a.date===attendanceDate);return <tr key={s.id}><td><b>{s.name}</b></td><td className="muted">{s.id}</td><td>{s.group}</td><td>{rec?<span className={`status ${rec.status==='حاضر'?'good':'bad'}`}>{rec.status}{rec.reason?' — '+rec.reason:''}</span>:<span className="status pending">لم يسجل</span>}</td><td><div className="action-row"><button className="tiny-btn present" onClick={()=>mark(s.id,'حاضر')}>حاضر</button><select className="reason-select" value={absReason} onChange={e=>setAbsReason(e.target.value)}><option>غياب عادي</option><option>رخصة</option><option>إعفاء</option><option>واجب</option></select><button className="tiny-btn absent" onClick={()=>mark(s.id,'غائب',absReason)}>غائب</button></div></td></tr>})}</tbody></table></div></section></>}
        {page==='tests'&&<><div className="action-row" style={{marginBottom:8}}><button className="btn btn-ghost" onClick={()=>setShowBulkResults(v=>!v)}>استيراد نتائج جماعي</button><button className="btn btn-ghost" onClick={()=>setShowBarmeEditor(v=>!v)}>محرر BARÈME</button></div>{showBulkResults&&<BulkResultsImport students={students} flash={flash}/>}{showBarmeEditor&&<BarmeEditor flash={flash}/>}<Tests students={students} test={test} setTest={setTest} testValue={testValue} setTestValue={setTestValue} resultStudent={resultStudent} setResultStudent={setResultStudent} flash={flash}/></>}
        {page==='results'&&<Results students={students}/>}
        {page==='sessions'&&<section className="panel"><div className="panel-head"><div><h2>سجل الحصص العام</h2><p>يعرض المدرب والتوقيت والمدة فقط دون محتوى الحصة الخاص</p></div><span className="status good">سجل مشترك للمؤسسة</span></div><div className="session-start"><div className="session-icon"><Clock3/></div><div className="grow"><b>تسجيل حصة جديدة</b><p>يُحفظ اسم المدرب ووقت البداية والنهاية والمدة.</p></div>{!sessionStarted?<button className="btn btn-primary" onClick={()=>{setSessionStarted(true);setSessionStart(new Date().toLocaleTimeString('ar-TN',{hour:'2-digit',minute:'2-digit'}));flash('بدأت تسجيل الحصة')}}><Plus size={16}/> بداية الحصة</button>:<button className="btn btn-danger" onClick={()=>{setSessionEnd(new Date().toLocaleTimeString('ar-TN',{hour:'2-digit',minute:'2-digit'}));setSessionStarted(false);log('إنهاء حصة',`أيوب | ${sessionStart} — ${new Date().toLocaleTimeString('ar-TN',{hour:'2-digit',minute:'2-digit'})}`);flash('تم تسجيل نهاية الحصة')}}>إنهاء الحصة</button>}</div>{sessionStarted&&<div className="live-session"><span className="pulse"/> حصة جارية — البداية: {sessionStart}</div>}<div className="empty-state"><Clock3 size={28}/><b>سجل الحصص التجريبي</b><p>ستظهر هنا الحصص المسجلة بعد ربط قاعدة البيانات.</p></div></section>}
        {page==='notebook'&&<section className="panel private-panel"><div className="panel-head"><div><div className="private-title"><NotebookPen size={20}/> <h2>كراس المدرب الخاص</h2><span className="lock-pill"><ShieldCheck size={13}/> خاص</span></div><p>مساحة شخصية لملاحظاتك ومحتوى حصصك. لا تظهر للمدربين الآخرين أو الإدارة.</p></div></div><div className="privacy-banner"><ShieldCheck size={18}/><div><b>خصوصيتك أولوية</b><p>في النسخة النهائية ستُفرض الخصوصية في قاعدة البيانات أيضًا عبر سياسات وصول مستقلة لكل مدرب.</p></div></div><div className="note-editor"><textarea value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="اكتب ملاحظاتك أو محتوى حصتك هنا..."/><button className="btn btn-primary" onClick={addNote}><Save size={16}/> حفظ في كراسي</button></div><div className="notes-list">{notes.map(n=><article className="note-card" key={n.id}><small>{n.date}</small><p>{n.text}</p><button onClick={()=>{const v=notes.filter(x=>x.id!==n.id);setNotes(v);persist('sp_private_notes',v)}} title="حذف"><Trash2 size={15}/></button></article>)}{!notes.length&&<div className="empty-state"><NotebookPen size={28}/><b>كراسك فارغ Currently</b><p>ابدأ بإضافة أول ملاحظة خاصة بك.</p></div>}</div></section>}
        {page==='injuries'&&<Placeholder icon={HeartPulse} title="متابعة الإصابات" desc="سجل الإصابات، تاريخها، نوعها، مدة التوقف، وتاريخ العودة."/>}
        {page==='audit'&&<section className="panel"><div className="panel-head"><div><h2>سجل التعديلات والعمليات</h2><p>تتبع من قام بالعملية ومتى وما الذي تغيّر</p></div><span className="status pending">نسخة تجريبية</span></div>{audit.length?<div className="table-wrap"><table><thead><tr><th>العملية</th><th>التفاصيل</th><th>بواسطة</th><th>التوقيت</th></tr></thead><tbody>{audit.map(a=><tr key={a.id}><td><b>{a.action}</b></td><td>{a.detail}</td><td>{a.by}</td><td className="muted">{a.at}</td></tr>)}</tbody></table></div>:<div className="empty-state"><ShieldCheck size={28}/><b>لا توجد عمليات مسجلة بعد</b><p>ستظهر هنا الإضافات والتعديلات والتسجيلات.</p></div>}</section>}
        {page==='reports'&&<Placeholder icon={FileText} title="التقارير والإحصائيات" desc="تقارير فردية وجماعية للحضور والغيابات والاختبارات والنتائج والتطور."/>}
        {page==='settings'&&<><section className="panel"><div className="panel-head"><div><h2>إعدادات المؤسسة</h2><p>الهوية البصرية والبيانات الأساسية</p></div></div><div className="settings-grid"><label>اسم المؤسسة<input value={institution} onChange={e=>setInstitution(e.target.value)}/></label><label>شعار المؤسسة<input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=()=>setLogo(r.result);r.readAsDataURL(f)}}}/></label></div>{logo&&<img className="logo-preview" src={logo}/>}<div className="privacy-banner"><Activity size={18}/><div><b>الشعار العام للتطبيق</b><p>يبقى ثابتًا ومشتركًا بين المؤسسات، بينما شعار المؤسسة أعلاه مستقل لكل مؤسسة.</p></div></div><button className="btn btn-primary" onClick={()=>flash('تم تحديث العرض المحلي. يلزم حفظ الإعدادات سحابيًا عند ربط Supabase.')}><Save size={16}/> حفظ الإعدادات</button></section><ConflictCenter flash={flash}/>{(role==="platform_owner"||role==="institution_admin"||role==="admin")&&<AccountRequestsPanel profile={authProfile} flash={flash}/>}</>}
      </div>
      <footer>SPORT PERFORMANCE <span>•</span> نسخة أولية للمعاينة والتطوير</footer>
    </main>
    {showAdd&&<div className="modal-backdrop" onClick={()=>setShowAdd(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>إضافة تلميذ</h2><p>تسجيل تلميذ جديد في المؤسسة</p></div><button onClick={()=>setShowAdd(false)}><X/></button></div><label>اسم التلميذ<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="الاسم واللقب"/></label><label>رقم التلميذ<input value={newId} onChange={e=>setNewId(e.target.value)} placeholder="مثال: SP-006"/></label><label>المجموعة<select value={newGroup} onChange={e=>setNewGroup(e.target.value)}><option>المجموعة A</option><option>المجموعة B</option></select></label><div className="modal-actions"><button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>إلغاء</button><button className="btn btn-primary" onClick={addStudent}><Plus size={16}/> إضافة</button></div></div></div>}
    {notice&&<div className="toast"><CheckCircle2 size={17}/>{notice}</div>}
  </div>
}
function MiniStat({label,value,icon:Icon,color=''}){return <div className="mini-stat"><div className={`mini-icon ${color}`}><Icon size={18}/></div><div><small>{label}</small><b>{value}</b></div></div>}
function Dashboard({students,attendance,setPage}){
  const todayRecords=attendance.filter(a=>a.date===today);const absent=todayRecords.filter(a=>a.status==='غائب').length;const avg=students.reduce((n,s)=>n+(Number(s.average)||0),0)/(students.filter(s=>Number(s.average)).length||1)
  return <><div className="stats-grid"><MiniStat label="إجمالي التلاميذ" value={students.length} icon={Users}/><MiniStat label="معدل الحضور العام" value="87%" icon={CalendarCheck} color="green"/><MiniStat label="متوسط النتائج" value={avg.toFixed(1)+'/20'} icon={TrendingUp} color="blue"/><MiniStat label="غيابات اليوم" value={absent} icon={UserX} color="red"/></div><div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h2>متابعة التلاميذ</h2><p>آخر التلاميذ في سجل المتابعة</p></div><button className="text-link" onClick={()=>setPage('students')}>عرض الكل <ChevronLeft size={15}/></button></div><StudentsTable students={students.slice(0,4)} compact onSelect={()=>setPage('tracking')}/></section><section className="panel"><div className="panel-head"><div><h2>الوصول السريع</h2><p>العمليات الأكثر استخدامًا</p></div></div><div className="quick-grid"><button onClick={()=>setPage('attendance')}><CalendarCheck/><b>تسجيل الغيابات</b><small>الحضور اليومي</small></button><button onClick={()=>setPage('tests')}><Dumbbell/><b>إدخال اختبار</b><small>نتائج التلاميذ</small></button><button onClick={()=>setPage('tracking')}><Activity/><b>بطاقة المتابعة</b><small>تطور التلميذ</small></button><button onClick={()=>setPage('notebook')}><NotebookPen/><b>كراس المدرب</b><small>ملاحظات خاصة</small></button></div></section></div><section className="panel bottom-panel"><div className="panel-head"><div><h2>ملخص النشاط</h2><p>نظرة سريعة على بيانات العرض</p></div></div><div className="activity-row"><div className="activity-bullet green-bullet"/><div><b>متابعة الحضور والغيابات</b><small>تسجيل يومي مرتبط ببطاقة كل تلميذ</small></div><span>مفعّل في العرض</span></div><div className="activity-row"><div className="activity-bullet blue-bullet"/><div><b>سجل الحصص العام</b><small>اسم المدرب والتوقيت والمدة فقط</small></div><span>جاهز للربط</span></div></section></>
}
function StudentsTable({students,compact=false,onSelect=()=>{}}){return <div className="table-wrap"><table><thead><tr><th>التلميذ</th><th>رقم التلميذ</th><th>المجموعة</th>{!compact&&<th>الحضور</th>}<th>المعدل</th><th>الحالة</th></tr></thead><tbody>{students.map(s=><tr key={s.id} onClick={()=>onSelect(s)} className="click-row"><td><div className="student-name"><div className="student-avatar">{s.name.slice(0,1)}</div><b>{s.name}</b></div></td><td className="muted">{s.id}</td><td>{s.group}</td>{!compact&&<td><div className="progress-cell"><div className="progress"><i style={{width:s.attendance+'%'}}/></div><small>{s.attendance}%</small></div></td>}<td><b>{s.average}{typeof s.average==='number'?'/20':''}</b></td><td><span className={`status ${s.status==='نشط'?'good':'pending'}`}>{s.status}</span></td></tr>)}</tbody></table></div>}
function Tracking({students,attendance,selected,onSelect}){const [tab,setTab]=useState('overview');const s=selected||students[0];if(!s)return <Placeholder title="لا يوجد تلاميذ" desc="أضف تلميذًا لبدء المتابعة."/>;const records=attendance.filter(a=>a.studentId===s.id).sort((a,b)=>b.date.localeCompare(a.date));return <section className="panel"><div className="panel-head"><div><h2>بطاقة متابعة التلميذ</h2><p>ملف موحد للحضور والنتائج والتطور</p></div><select value={s.id} onChange={e=>onSelect(students.find(x=>x.id===e.target.value))}>{students.map(x=><option value={x.id}>{x.name}</option>)}</select></div><div className="student-profile"><div className="profile-avatar">{s.name.slice(0,1)}</div><div className="grow"><h2>{s.name}</h2><p>{s.id} · {s.group} · {s.age} سنة</p></div><span className="status good">{s.status}</span></div><div className="profile-stats"><MiniStat label="نسبة الحضور" value={s.attendance+'%'} icon={CalendarCheck} color="green"/><MiniStat label="المعدل العام" value={s.average+'/20'} icon={TrendingUp} color="blue"/><MiniStat label="عدد الغيابات المسجلة" value={records.filter(x=>x.status==='غائب').length} icon={UserX} color="red"/></div><div className="tabs"><button className={tab==='overview'?'selected':''} onClick={()=>setTab('overview')}>نظرة عامة</button><button className={tab==='attendance'?'selected':''} onClick={()=>setTab('attendance')}>سجل الحضور</button><button className={tab==='results'?'selected':''} onClick={()=>setTab('results')}>النتائج</button></div>{tab==='overview'&&<div className="overview-note"><Activity/><div><b>المتابعة المستمرة</b><p>تُجمع في هذه البطاقة بيانات الحضور والغيابات والاختبارات والإصابات والقياسات عبر الزمن. بعض الأقسام ستُفعّل بعد ربط قاعدة البيانات.</p></div></div>}{tab==='attendance'&&(records.length?<div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>الحالة</th><th>التصنيف</th></tr></thead><tbody>{records.map(r=><tr><td>{r.date}</td><td>{r.status}</td><td>{r.reason||'—'}</td></tr>)}</tbody></table></div>:<div className="empty-state"><ShieldCheck size={28}/><b>لا سجل حضور بعد</b><p>سجل الحضور سيظهر هنا بعد التسجيل.</p></div>)}{tab==='results'&&<section className="panel"><div className="panel-head"><div><h2>نتائج التلميذ</h2><p>نتائج الاختبارات المسجلة</p></div></div><div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>التلميذ</th><th>الاختبار</th><th>النتيجة الخام</th><th>المعدل</th></tr></thead><tbody>{/* test entries will be rendered here */}</tbody></table></div></section>}</section>}
function Tests({students,test,setTest,testValue,setTestValue,resultStudent,setResultStudent,flash}){const [entries,setEntries]=useState(()=>read('sp_test_entries',[]));const save=()=>{if(!testValue.trim())return flash('أدخل النتيجة الخام');const v=[{id:Date.now(),student:resultStudent,test,raw:testValue,date:today},...entries];setEntries(v);persist('sp_test_entries',v);setTestValue('');flash('حُفظت النتيجة الخام. لم يُحتسب معدل لغياب سلم رسمي.')};return <section className="panel"><div className="panel-head"><div><h2>الاختبارات الرياضية</h2><p>إدخال النتيجة الخام مع المحافظة على سلم التنقيط المعتمد</p></div><span className="status pending">سلالم التنقيط غير مضافة</span></div><div className="test-grid"><label>اختيار التلميذ<select value={resultStudent} onChange={e=>setResultStudent(e.target.value)}>{students.map(s=><option value={s.id}>{s.name}</option>)}</select></label><label>الاختبار<select value={test} onChange={e=>setTest(e.target.value)}><option>Test Navette — Léger 20m</option><option>Pompes</option><option>Abdominaux</option><option>Barre fixe</option></select></label><label>النتيجة الخام<input value={testValue} onChange={e=>setTestValue(e.target.value)} placeholder="مثال: 10"/></label><button className="btn btn-primary" onClick={save}><Save size={16}/> حفظ النتيجة</button></div><div className="protocol-card"><Dumbbell/><div><b>ملاحظة حول Test Navette</b><p>البروتوكول المعتمد: Léger، مسافة 20 مترًا، سرعة بداية 8.5 كم/س وزيادة 0.5 كم/س كل دقيقة. يجب تسجيل المستوى والذهابات المكتملة، وليس السرعة وحدها.</p></div></div><div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>التلميذ</th><th>الاختبار</th><th>النتيجة الخام</th><th>المعدل</th></tr></thead><tbody>{entries.map(e=><tr><td>{e.date}</td><td>{students.find(s=>s.id===e.student)?.name||e.student}</td><td>{e.test}</td><td><b>{e.raw}</b></td><td><span className="status pending">بانتظار سلم التنقيط</span></td></tr>)}</tbody></table></div></section>}
function Results({students}){return <section className="panel"><div className="panel-head"><div><h2>النتائج والمعدلات</h2><p>النتيجة الخام والمعدل المحوّل حقلاّن منفصلان</p></div></div><div className="privacy-banner"><CircleHelp/><div><b>لن نخترع سلمًا للتنقيط</b><p>يلزم إدخال جداول التنقيط الرسمية لكل اختبار قبل حساب المعدلات. عند عدم وجود نتيجة في الجدول يُعتمد أقرب عدد أعلى حسب القرار المعتمد.</p></div></div><StudentsTable students={students}/></section>}
function Placeholder({icon:ClipboardList,title,desc}){return <section className="panel placeholder"><div className="placeholder-icon"><ClipboardList size={27}/></div><h2>{title}</h2><p>{desc}</p><span className="status pending">واجهة مهيأة — التنفيذ التفصيلي في المرحلة التالية</span></section>}
export default App


