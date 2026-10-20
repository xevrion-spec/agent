/* Illustrative workflow records only. No provider writes or external sends. */
export function serviceExample(care, moment) {
  const day=n=>new Date(moment+n*86400000).toISOString().slice(0,10);
  const checked=new Date(moment).toISOString();
  const enquiries=(care.drafts||[]).slice(0,3).map((r,i)=>({...r,source_status:r.status,journey_status:i===1?'escalated':'open',owner:i===0?'Sarah Vale':null,
    next_step:i===1?'A person reviews the complaint':'Review the draft and confirm the next step',due_on:day(0),version:0,reopens:0,
    sources:[{id:'care-settings',version:3,source:'Approved opening hours, services and reply rules'}]}));
  const invoice={id:'demo-invoice-1',reference:'INV-2401',provider:'xero',provider_id:'demo-source-invoice',customer:'Northgate Freight',email:'finance@northgate.example',customer_id:'demo-contact',remaining_pence:240000,currency:'GBP',due_on:day(-12),checked_at:checked,provider_status:'AUTHORISED',status:'overdue',hold:'none',version:1,decision:{eligible:true,stage:0,reason:'12 days overdue, source balance checked, no active hold'}};
  const job={id:'demo-job-1',job_reference:'JOB-124',title:'Completed depot maintenance',customer_id:'demo-contact',completed_on:day(-1),due_on:day(30),completion_ref:'Signed completion sheet JOB-124',agreed_price_ref:'Approved quote Q-118',status:'draft',provider:'xero',prepared_by:'Sarah Vale',reference:'XVJOB-DEMO124',version:1,net_pence:62500,customer_name:'Kirkby Joinery',
    evidence_text:'Kirkby Joinery signed the completion sheet on site. The work matches quote Q-118: two and a half days of depot maintenance at the agreed day rate.',
    attachments:[{id:'file-124-1',filename:'JOB-124 signed sheet.pdf',bytes:184320,upload_status:'pending'},{id:'file-124-2',filename:'Depot after the work.jpg',bytes:942080,upload_status:'pending'}],
    lines:[{description:'Agreed depot maintenance (day rate)',quantity:'2.5',unit_pence:25000,account_code:'200',tax_type:'OUTPUT2'}]};
  const invoices=[invoice,
    {...invoice,id:'demo-invoice-2',reference:'INV-2390',customer:'Bristol Kitchens',remaining_pence:90000,status:'disputed',hold:'disputed',note:'Customer queried an extra charge',decision:{eligible:false,reason:'Dispute held for a person'}},
    {...invoice,id:'demo-invoice-3',reference:'INV-2418',customer:'Westbank Studio',remaining_pence:145000,due_on:day(8),status:'not_due',decision:{eligible:false,reason:'Invoice is not due yet'}},
    {...invoice,id:'demo-invoice-4',reference:'INV-2384',customer:'Maple Office Services',remaining_pence:72000,promised_on:day(3),status:'promised',hold:'promised',note:'Customer promised payment on the recorded date',decision:{eligible:false,reason:'Active payment promise; reminders held'}},
    {...invoice,id:'demo-invoice-5',reference:'INV-2372',customer:'Oakbridge Workshop',remaining_pence:0,paid_pence:98000,paid_on:day(-2),provider_status:'PAID',status:'settled',decision:{eligible:false,reason:'Accounting source reports a settled balance'}},
    // 16A: three more overdue invoices, so the chase ranking and the payment habits have something to rank
    {...invoice,id:'demo-invoice-6',reference:'INV-2366',customer:'Pennine Plant Hire',customer_id:'demo-contact-6',email:'accounts@pennineplant.example',remaining_pence:325000,due_on:day(-34),issued_on:day(-64),
      predicted:{on:day(0),usual_on:day(-13),basis:'customer',sample:5,confidence:'medium',past_usual:true,usual_days_late:21},pattern:{paid:5,median_days_late:21,average_days_late:19.4,on_time_rate:0,promises_kept:1,promises_missed:1,promise_rate:0.5},
      decision:{eligible:true,stage:2,reason:'34 days overdue, no active hold, stage 3'}},
    {...invoice,id:'demo-invoice-7',reference:'INV-2395',customer:'Kirkby Joinery',customer_id:'demo-contact-7',email:'office@kirkbyjoinery.example',remaining_pence:118000,due_on:day(-19),issued_on:day(-49),
      predicted:{on:day(3),usual_on:day(3),basis:'customer',sample:3,confidence:'medium',past_usual:false,usual_days_late:22},pattern:{paid:3,median_days_late:22,average_days_late:20.3,on_time_rate:0,promises_kept:0,promises_missed:0,promise_rate:null},
      decision:{eligible:true,stage:1,reason:'19 days overdue, no active hold, stage 2'}},
    {...invoice,id:'demo-invoice-8',reference:'INV-2399',customer:'Harbour Café',customer_id:'demo-contact-8',email:'hello@harbourcafe.example',remaining_pence:64000,due_on:day(-6),issued_on:day(-36),
      predicted:{on:day(1),usual_on:day(1),basis:'customer',sample:6,confidence:'high',past_usual:false,usual_days_late:7},pattern:{paid:6,median_days_late:7,average_days_late:6.5,on_time_rate:0.333,promises_kept:2,promises_missed:0,promise_rate:1},
      decision:{eligible:true,stage:0,reason:'6 days overdue, no active hold, stage 1'}}];
  invoices[0].predicted={on:day(6),usual_on:day(6),basis:'customer',sample:4,confidence:'medium',past_usual:false,usual_days_late:18};
  invoices[0].pattern={paid:4,median_days_late:18,average_days_late:16.8,on_time_rate:0.25,promises_kept:0,promises_missed:0,promise_rate:null};
  invoices[3].predicted={on:day(3),basis:'promise',sample:3,confidence:'high',past_usual:false};
  const jobs=[job,
    {...job,id:'demo-job-2',job_reference:'JOB-125',title:'Completed workshop inspection',customer_name:'Westbank Studio',evidence_text:'',attachments:[{id:'file-125-1',filename:'JOB-125 inspection.pdf',bytes:120832,upload_status:'pending'}],net_pence:32000,completion_ref:'Signed inspection JOB-125',agreed_price_ref:'Approved quote Q-120',reference:'XVJOB-DEMO125',prepared_by:'Dan Okafor',lines:[{description:'Agreed workshop inspection',quantity:'1',unit_pence:32000,account_code:'200',tax_type:'OUTPUT2'}]},
    {...job,id:'demo-job-3',job_reference:'JOB-122',title:'Completed lighting repair',customer_name:'Maple Office Services',reference:'XVJOB-DEMO122',status:'reconciliation_required',error:'Provider result unclear. Check Xero before retrying.',completion_ref:'Signed repair sheet JOB-122',agreed_price_ref:'Approved quote Q-112',approved_by:'Grace Lin'},
    {...job,id:'demo-job-5',job_reference:'JOB-117',title:'Completed boiler service',customer_name:'Harbour Café',completed_on:day(-12),net_pence:48000,reference:'XVJOB-DEMO117',prepared_by:'Dan Okafor',attachments:[{id:'file-117-1',filename:'JOB-117 service sheet.pdf',bytes:88064,upload_status:'pending'}],
      completion_ref:'Signed service sheet JOB-117',agreed_price_ref:'Approved quote Q-115',lines:[{description:'Agreed boiler service',quantity:'1',unit_pence:48000,account_code:'200',tax_type:'OUTPUT2'}]},
    {...job,id:'demo-job-6',job_reference:'JOB-112',title:'Completed fire door survey',customer_name:'Pennine Plant Hire',completed_on:day(-34),net_pence:115000,reference:'XVJOB-DEMO112',
      completion_ref:'Signed survey JOB-112',agreed_price_ref:'Approved quote Q-104',lines:[{description:'Agreed fire door survey',quantity:'1',unit_pence:115000,account_code:'200',tax_type:'OUTPUT2'}]},
    {...job,id:'demo-job-4',job_reference:'JOB-119',title:'Completed access review',customer_name:'Oakbridge Workshop',attachments:[{id:'file-119-1',filename:'JOB-119 review.pdf',bytes:96256,upload_status:'uploaded'}],reference:'XVJOB-DEMO119',status:'created',invoice_id:'DEMO-XERO-119',created_in_accounts_at:checked,completion_ref:'Signed review JOB-119',agreed_price_ref:'Approved quote Q-108',approved_by:'Sarah Vale'}];
  // 14B: the whole-workspace figures the gateway sends with each view (focused_services.py), matching the records above
  // plus earlier jobs already sent and paid from Xero.
  const series=[5,6,4,7,6,2,1,8,7,9,6,7,5,4],minutes=[12,9,15,8,10,22,18,6,7,9,5,8,7,6];
  const figures={overdue:{pence:747000,count:4},due_7d:{pence:0,count:0},held:{pence:162000,count:2},month:day(0).slice(0,7),
    ageing:[{key:'not_due',pence:145000,count:1},{key:'1-7',pence:64000,count:1},{key:'8-30',pence:358000,count:2},{key:'31+',pence:325000,count:1}],
    collected_month:{pence:98000,count:1,unmeasured:0},
    to_check:{count:5,pence:320000},needs_person:1,drafted:{count:1,pence:62500},sent:{count:2,pence:118000},paid:{count:5,pence:331500},partial:false,
    invoiced_month:{pence:180500,count:3,unmeasured:0},
    labels:series.map((_,i)=>day(i-13)),by_xevrion:series.map(()=>0),checked:series,first_reply_minutes:minutes,median_minutes:8,timezone:'Europe/London'};
  // one reminder already prepared for the overdue invoice, so its approval (with the amount checked beside it) is one click away
  const reminders=[{id:'rem_1',invoice_id:invoice.id,status:'ready',version:1,tone:'standard',payment_url:null,statutory:null,email:invoice.email,
    subject:'Invoice INV-2401: £2,400.00 is now overdue',created_at:checked,
    text:'Hi Jo,\n\nA quick reminder that invoice INV-2401 for £2,400.00 was due on '+new Date(day(-12)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long'})+'. If you have already paid, please ignore this. If something is wrong, just reply and we will check.\n\nThanks,\nSarah, Harbour & Vale'}];
  // 16A: the gateway's `intel` (focused_services.py collection_intel, billing_intel, reply_intel, month_value), matching the
  // example records above. Every figure here is an example.
  const why=(...xs)=>xs;
  const intel={
    collections:{recovered:{month:day(0).slice(0,7),pence:98000,count:1,last_month_pence:214000,method:'Invoices paid in full within 30 days after a reminder you approved, measured from your accounts. The amount is the balance that was owed, not new income.'},
      chase:[{id:'demo-invoice-6',reference:'INV-2366',customer:'Pennine Plant Hire',remaining_pence:325000,due_on:day(-34),days_late:34,score:9478.13,why:why('£3,250.00 owed','34 days late','usually pays 21 days late','missed 1 promise','later than they usually pay','last reminder '+new Date(day(-6)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short'})),action:{kind:'prepare'},predicted:invoices[5].predicted},
        {id:'demo-invoice-1',reference:'INV-2401',customer:'Northgate Freight',remaining_pence:240000,due_on:day(-12),days_late:12,score:4200,why:why('£2,400.00 owed','12 days late','usually pays 18 days late','no reminder sent yet'),action:{kind:'approve',reminder_id:'rem_1',version:1},predicted:invoices[0].predicted},
        {id:'demo-invoice-7',reference:'INV-2395',customer:'Kirkby Joinery',remaining_pence:118000,due_on:day(-19),days_late:19,score:2410.83,why:why('£1,180.00 owed','19 days late','usually pays 22 days late','last reminder '+new Date(day(-9)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short'})),action:{kind:'prepare'},predicted:invoices[6].predicted},
        {id:'demo-invoice-8',reference:'INV-2399',customer:'Harbour Café',remaining_pence:64000,due_on:day(-6),days_late:6,score:768,why:why('£640.00 owed','6 days late','no reminder sent yet'),action:{kind:'prepare'},predicted:invoices[7].predicted}],
      chase_total:4,
      customers:[{customer:'Pennine Plant Hire',owed_pence:325000,open_invoices:1,paid:5,median_days_late:21,average_days_late:19.4,on_time_rate:0,median_days_to_pay:51,promises_kept:1,promises_missed:1,promise_rate:0.5,next_payment:invoices[5].predicted,oldest_days_late:34},
        {customer:'Northgate Freight',owed_pence:240000,open_invoices:1,paid:4,median_days_late:18,average_days_late:16.8,on_time_rate:0.25,median_days_to_pay:48,promises_kept:0,promises_missed:0,promise_rate:null,next_payment:invoices[0].predicted,oldest_days_late:12},
        {customer:'Westbank Studio',owed_pence:145000,open_invoices:1,paid:2,median_days_late:-1,average_days_late:0,on_time_rate:1,median_days_to_pay:29,promises_kept:0,promises_missed:0,promise_rate:null,next_payment:{on:day(7),basis:'customer',sample:2,confidence:'low',past_usual:false},oldest_days_late:0},
        {customer:'Kirkby Joinery',owed_pence:118000,open_invoices:1,paid:3,median_days_late:22,average_days_late:20.3,on_time_rate:0,median_days_to_pay:52,promises_kept:0,promises_missed:0,promise_rate:null,next_payment:invoices[6].predicted,oldest_days_late:19},
        {customer:'Bristol Kitchens',owed_pence:90000,open_invoices:1,paid:6,median_days_late:3,average_days_late:4.2,on_time_rate:0.5,median_days_to_pay:33,promises_kept:1,promises_missed:0,promise_rate:1,next_payment:null,oldest_days_late:12},
        {customer:'Maple Office Services',owed_pence:72000,open_invoices:1,paid:3,median_days_late:9,average_days_late:8,on_time_rate:0.333,median_days_to_pay:39,promises_kept:2,promises_missed:1,promise_rate:0.667,next_payment:invoices[3].predicted,oldest_days_late:12},
        {customer:'Harbour Café',owed_pence:64000,open_invoices:1,paid:6,median_days_late:7,average_days_late:6.5,on_time_rate:0.333,median_days_to_pay:37,promises_kept:2,promises_missed:0,promise_rate:1,next_payment:invoices[7].predicted,oldest_days_late:6}],
      workspace_pattern:{paid:31,median_days_late:9,average_days_late:10.2,on_time_rate:0.29,median_days_to_pay:39,promises_kept:6,promises_missed:2,promise_rate:0.75},
      dso:{days:47,receivables_pence:1054000,invoiced_90d_pence:2018000,method:'Money owed now divided by the amount invoiced in the last 90 days, times 90 (days sales outstanding).'},
      trend:[5,4,3,2,1,0].map((b,i)=>{const d=new Date(moment);d.setUTCDate(15);d.setUTCMonth(d.getUTCMonth()-b);return {month:d.toISOString().slice(0,7),median_days_to_pay:[46,44,45,41,39,37][i],average_days_late:[15.1,13.8,14.2,11.0,9.6,8.4][i],paid:[4,6,5,7,5,4][i]};}),
      week:{paid_pence:98000,paid:1,paid_pence_before:152000,paid_before:2,reminders:3,reminders_before:2,promises:1,promises_before:0},partial:false},
    billing:{unbilled_ageing:[{key:'0-7',pence:157000,count:3},{key:'8-30',pence:48000,count:1},{key:'31+',pence:115000,count:1}],
      left_on_table:{pence:163000,count:2,method:'Finished more than 7 days ago and not yet a draft invoice in Xero, before tax.'},
      unrecorded:{count:1,latest:[{id:'demo-op-1',name:'Gutter repair at Mill Lane',at:checked}]},
      next:[{id:'demo-job-6',job_reference:'JOB-112',title:'Completed fire door survey',customer:'Pennine Plant Hire',net_pence:115000,completed_on:day(-34),age_days:34,status:'draft',score:3946.43,why:why('£1,150.00 before tax','finished 34 days ago','older jobs are harder to collect'),action:{kind:'approve',version:1}},
        {id:'demo-job-1',job_reference:'JOB-124',title:'Completed depot maintenance',customer:'Kirkby Joinery',net_pence:62500,completed_on:day(-1),age_days:1,status:'draft',score:669.64,why:why('£625.00 before tax','finished 1 day ago'),action:{kind:'approve',version:1}},
        {id:'demo-job-3',job_reference:'JOB-122',title:'Completed lighting repair',customer:'Maple Office Services',net_pence:62500,completed_on:day(-1),age_days:1,status:'reconciliation_required',score:669.64,why:why('£625.00 before tax','finished 1 day ago','check Xero before trying again'),action:{kind:'reconcile',version:1}},
        {id:'demo-job-5',job_reference:'JOB-117',title:'Completed boiler service',customer:'Harbour Café',net_pence:48000,completed_on:day(-12),age_days:12,status:'draft',score:891.43,why:why('£480.00 before tax','finished 12 days ago'),action:{kind:'approve',version:1}},
        {id:'demo-job-2',job_reference:'JOB-125',title:'Completed workshop inspection',customer:'Westbank Studio',net_pence:32000,completed_on:day(-1),age_days:1,status:'draft',score:342.86,why:why('£320.00 before tax','finished 1 day ago'),action:{kind:'approve',version:1}}].sort((a,z)=>z.score-a.score),
      next_total:5,
      weekly:[0,82000,64000,0,118000,95000,41000,62500].map((p,i)=>{const d=new Date(moment);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)-7*(7-i));return {week:d.toISOString().slice(0,10),pence:p,count:p?Math.max(1,Math.round(p/50000)):0};}),
      week:{drafted_pence:62500,drafted:1,drafted_pence_before:41000,drafted_before:1,recorded:4,recorded_before:2},partial:false},
    replies:{target_minutes:60,targets:{labels:series.map((_,i)=>day(i-13)),replies:series,within:series.map((v,i)=>v-[0,1,0,0,1,0,0,1,0,0,0,1,0,0][i]),missed:[0,1,0,0,1,0,0,1,0,0,0,1,0,0],within_share:0.948},
      confidence:{high:2,medium:0,low:1,none:1},
      saved:{month:day(0).slice(0,7),replies:92,by_xevrion:0,hours:6.1,pence:null,hourly_cost_set:false,basis:'estimated',method:'92 replies sent from a written draft this month x about 4 minutes a reply (your estimate until 10 replies are timed). Add your hourly cost to see it in pounds.'},
      week:{sent:46,sent_before:39,resolved:5,resolved_before:3}},
    value:{month:day(0).slice(0,7),recovered:{pence:98000,count:1,method:'Paid within 30 days after a reminder you approved, from your accounts.'},
      billed:{pence:180500,count:3,method:'Draft invoices made in Xero from finished jobs, before tax.'},
      saved:{hours:6.1,replies:92,pence:null,method:'92 replies x 4 minutes (estimated). Add your hourly cost to value it.'}}};
  return {intel,figures,cases:enquiries,invoices,jobs,reminders,pagination:{page:1,page_size:200,has_previous:false,has_more:false},policy:{version:1,inbox:'gmail',signature:'Sarah, Harbour & Vale accounts',reminder_days:[3,7,14],minimum_gap_days:3},accounts:['xero'],setup:{inbox:['gmail'],replies_enabled:true,policy_ready:true,billing_provider:'xero',approval_required:true},metrics:{open_enquiries:enquiries.length,confirmed_resolutions:0,confirmed_bookings:0,overdue_pence:240000,jobs_to_invoice:2,accounting_drafts:1},proof:{items:[],buckets:{},net_realised_pence:0}};
}
