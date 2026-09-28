import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
flow={
 'name':'BFL — authorised stewardship coaching', 'active':False,
 'nodes':[
  {'id':'bfl-webhook','name':'Authorised request','type':'n8n-nodes-base.webhook','typeVersion':2,'position':[0,0],
   'parameters':{'httpMethod':'POST','path':'bfl-coaching','authentication':'headerAuth','responseMode':'lastNode','responseData':'firstEntryJson','options':{}},
   'credentials':{'httpHeaderAuth':{'name':'BFL Backend Webhook'}}},
  {'id':'openai-response','name':'OpenAI structured coaching','type':'n8n-nodes-base.httpRequest','typeVersion':4.2,'position':[280,0],
   'parameters':{'method':'POST','url':'https://api.openai.com/v1/responses','authentication':'genericCredentialType','genericAuthType':'httpHeaderAuth','sendBody':True,'specifyBody':'json','jsonBody':'={{ JSON.stringify($json.body.request) }}','options':{'timeout':75000,'redirect':{'redirect':{'followRedirects':False}}}},
   'credentials':{'httpHeaderAuth':{'name':'OpenAI Server Authorization'}}},
 ],
 'connections':{'Authorised request':{'main':[[{'node':'OpenAI structured coaching','type':'main','index':0}]]}},
 'settings':{'executionOrder':'v1','executionTimeout':90,'saveDataErrorExecution':'none','saveDataSuccessExecution':'none','saveManualExecutions':False},
 'pinData':{},'tags':[]
}
path=root/'n8n/workflows/stewardship-coaching.json';path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(json.dumps(flow,indent=2),encoding='utf-8')
