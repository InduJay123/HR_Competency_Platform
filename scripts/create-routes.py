from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'frontend/src/app/(workspace)'
routes = {
 'employee/dashboard': ('dashboard-live', 'Dashboard', '<Dashboard role="employee"/>'),
 'manager/dashboard': ('dashboard-live', 'Dashboard', '<Dashboard role="manager"/>'),
 'hr/dashboard': ('dashboard-live', 'Dashboard', '<Dashboard role="hr"/>'),
 'employee/tasks': ('work', 'WorkList', '<WorkList/>'),
 'manager/tasks': ('work', 'WorkList', '<WorkList team/>'),
 'manager/tasks/create': ('work', 'AssignWork', '<AssignWork/>'),
 'hr/employees': ('people', 'People', '<People manage/>'),
 'hr/employees/[id]': ('employee-detail','EmployeeDetail','<EmployeeDetail/>'),
 'manager/team': ('people', 'People', '<People/>'),
 'hr/organisation': ('people', 'Organisation', '<Organisation/>'),
 'hr/settings': ('settings', 'Settings', '<Settings/>'),
 'employee/notifications': ('notices', 'Notices', '<Notices/>'),
 'employee/account': ('account','Account','<Account/>'),
 'employee/onboarding': ('onboarding','Onboarding','<Onboarding/>'),
 'employee/reviews': ('review-list','ReviewList','<ReviewList/>'),
 'manager/reviews': ('review-list','ReviewList','<ReviewList scope="manager"/>'),
 'hr/reviews': ('review-list','ReviewList','<ReviewList scope="hr"/>'),
 'hr/approvals': ('review-list','ReviewList','<ReviewList scope="approvals"/>'),
 'hr/review-cycles': ('cycles','Cycles','<Cycles/>'),
 'employee/reviews/[id]': ('review-detail','ReviewDetail','<ReviewDetail/>'),
 'manager/reviews/[id]': ('review-detail','ReviewDetail','<ReviewDetail/>'),
 'hr/reviews/[id]': ('review-detail','ReviewDetail','<ReviewDetail/>'),
 'employee/development': ('development','Development','<Development/>'),
 'employee/reviews/[id]/comparison': ('comparison','Comparison','<Comparison/>'),
 'manager/development': ('development','Development','<Development/>'),
}
for route, (module, component, markup) in routes.items():
    path = root / route / 'page.tsx'
    if path.exists():
        continue
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"import {{{component}}} from '@/components/{module}';\nexport default function Page(){{return {markup};}}\n", encoding='utf-8')
for role in ['employee', 'manager']:
    path = root / role / 'tasks/[id]/page.tsx'
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("import {WorkDetail} from '@/components/work';\nexport default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <WorkDetail id={id}/>;}\n", encoding='utf-8')
