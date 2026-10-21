import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ManagedImports from './ManagedImports';
import session from '../solidSession';
import { connectionWorkerCall } from '../dataConnectionClient';
jest.mock('../solidSession', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn()
  }
}));
jest.mock('../i18n', () => ({
  useI18n: () => ({
    language: 'en'
  })
}));
jest.mock('../config/runtimeConfig', () => ({
  getSyncWorkerConfig: () => ({
    enabled: true,
    apiUrl: '/sync-worker'
  })
}));
jest.mock('../dataConnectionClient', () => ({
  connectionWorkerCall: jest.fn()
}));
jest.mock('./DataConnection', () => ({
  ConnectionModal: ({
    children,
    title
  }) => <div role="dialog" aria-label={title}>{children}</div>
}));
function ImportsHarness({ webId }) {
  return <ManagedImports webId={webId}>{imports => <>
    <button disabled={!imports.available} onClick={() => imports.open(null)}>Add connection</button>
    {imports.error && <p role="alert">{imports.error}</p>}
    {imports.notice && <p role="status">{imports.notice}</p>}
    {imports.rows.map(imports.renderCard)}
  </>}</ManagedImports>;
}
const row = {
  id: 'sample',
  name: 'Example import',
  targetBase: 'https://pod.example/a/connections/test/',
  schedule: {
    kind: 'daily',
    at: '10:03'
  },
  enabled: true,
  activated: true,
  state: {
    status: 'success',
    lastSuccessAt: '2026-10-20T12:00:00Z'
  }
};
beforeEach(() => {
  jest.clearAllMocks();
  session.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      imports: [row]
    })
  });
  connectionWorkerCall.mockResolvedValue({
    ok: true
  });
});
test('managed imports are accessible without personal connection setup and schedule changes contain no credentials or target edits', async () => {
  render(<ImportsHarness webId="https://pod.example/a/profile/card#me" />);
  fireEvent.click(await screen.findByRole('button', {
    name: /^Example import /
  }));
  fireEvent.change(screen.getByLabelText('Time (UTC)'), {
    target: {
      value: '11:30'
    }
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Save connection'
  }));
  expect(await screen.findByText('Import settings saved.')).toBeInTheDocument();
  expect(connectionWorkerCall).toHaveBeenCalledWith('https://pod.example/a/profile/card#me', session.fetch, 'imports', {
    id: 'sample',
    action: 'update',
    changes: {
      enabled: true,
      schedule: {
        kind: 'daily',
        at: '11:30'
      }
    }
  });
});
test('late responses from a previous Solid identity never populate the next account', async () => {
  let resolve;
  session.fetch.mockImplementationOnce(() => new Promise(r => {
    resolve = r;
  })).mockResolvedValue({
    ok: true,
    json: async () => ({
      imports: []
    })
  });
  const view = render(<ImportsHarness webId="https://pod.example/a/profile/card#me" />);
  view.rerender(<ImportsHarness webId="https://pod.example/b/profile/card#me" />);
  await act(async () => resolve({
    ok: true,
    json: async () => ({
      imports: [row]
    })
  }));
  expect(screen.queryByText('Example import')).not.toBeInTheDocument();
});
const editable = {
  ...row,
  provider: 'udsp',
  ownerWebId: 'https://pod.example/a/profile/card#me',
  source: {
    tenant: 'testumwelt'
  },
  name: 'UDSP sensors'
};
const metadata = {
  imports: [editable],
  templates: [{
    id: 'udsp',
    name: 'UDSP sensors',
    fields: [{
      key: 'tenant',
      label: 'Tenant',
      type: 'text',
      default: 'testumwelt'
    }]
  }],
  issuers: ['https://pod.example'],
  namespace: 'test',
  canChooseOwner: true
};
function setupEditor() {
  session.fetch.mockImplementation(async url => ({
    ok: true,
    status: 200,
    json: async () => String(url).includes('preview=') ? {
      preview: {
        id: 'checked',
        status: 'success',
        result: {
          files: 1,
          resources: [{
            path: 'sensor.json',
            records: 3,
            added: 1,
            mode: 'append',
            sample: [{
              temperature: 10
            }]
          }]
        }
      }
    } : metadata
  }));
  connectionWorkerCall.mockImplementation(async (_webId, _fetch, _route, payload) => payload.action === 'preview' ? {
    ok: true,
    preview: {
      id: 'checked',
      status: 'running'
    }
  } : {
    ok: true
  });
}
test('new import requires a successful preview and saves only the approved token', async () => {
  setupEditor();
  render(<ImportsHarness webId="https://pod.example/a/profile/card#me" />);
  const add = await screen.findByRole('button', {
    name: 'Add connection'
  });
  await waitFor(() => expect(add).toBeEnabled());
  fireEvent.click(add);
  const save = screen.getByRole('button', {
    name: 'Create connection'
  });
  expect(save).toBeDisabled();
  expect(screen.getByLabelText('Target folder in Pod').value).toMatch(/^https:\/\/pod.example\/a\/connections\/test\/imports\//);
  fireEvent.click(screen.getByRole('button', {
    name: 'Test and preview'
  }));
  expect(await screen.findByText('Preview successful')).toBeInTheDocument();
  expect(save).toBeEnabled();
  const submitted = connectionWorkerCall.mock.calls.find(call => call[3].action === 'preview')[3];
  expect(submitted.draft.credentialImportId).toBe('sample');
  expect(submitted.draft.credentials).toEqual({});
  fireEvent.click(save);
  expect(await screen.findByText('Import created.')).toBeInTheDocument();
  expect(connectionWorkerCall).toHaveBeenLastCalledWith('https://pod.example/a/profile/card#me', session.fetch, 'imports', {
    action: 'save',
    previewId: 'checked'
  });
});
test('editing keeps existing destination fixed; source edits invalidate successful previews', async () => {
  setupEditor();
  render(<ImportsHarness webId="https://pod.example/a/profile/card#me" />);
  fireEvent.click(await screen.findByRole('button', {
    name: /^UDSP sensors /
  }));
  expect(screen.getByLabelText('Target folder in Pod')).toBeDisabled();
  expect(screen.getByLabelText('Pod owner (WebID)')).toBeDisabled();
  expect(screen.getByLabelText('Template')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Tenant'), {
    target: {
      value: 'next'
    }
  });
  expect(screen.getByRole('button', {
    name: 'Save connection'
  })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {
    name: 'Test and preview'
  }));
  await screen.findByText('Preview successful');
  expect(screen.getByRole('button', {
    name: 'Save connection'
  })).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Tenant'), {
    target: {
      value: 'changed-again'
    }
  });
  expect(screen.getByRole('button', {
    name: 'Save connection'
  })).toBeDisabled();
  expect(screen.queryByText('Preview successful')).not.toBeInTheDocument();
});
test('failed preview keeps saving disabled and exposes a readable error', async () => {
  setupEditor();
  session.fetch.mockImplementation(async url => ({
    ok: true,
    status: 200,
    json: async () => String(url).includes('preview=') ? {
      preview: {
        id: 'checked',
        status: 'failed',
        error: 'Source returned HTTP 500.'
      }
    } : metadata
  }));
  render(<ImportsHarness webId="https://pod.example/a/profile/card#me" />);
  const add = await screen.findByRole('button', {
    name: 'Add connection'
  });
  await waitFor(() => expect(add).toBeEnabled());
  fireEvent.click(add);
  fireEvent.click(screen.getByRole('button', {
    name: 'Test and preview'
  }));
  await screen.findByText('Source returned HTTP 500.');
  expect(screen.getByRole('button', {
    name: 'Create connection'
  })).toBeDisabled();
});
test('Wuppertal climate template requires its own source key when reusing another import Pod credential',async()=>{
 setupEditor();const climate={id:'wuppertal-climate',name:'Wuppertal - Climate station',requiresSourceSecret:true,defaultSchedule:{kind:'interval',seconds:600},fields:[{key:'initialLookbackHours',label:'Initial history (hours)',type:'number',default:24,min:1,max:744},{key:'windowHours',label:'Maximum time window (hours)',type:'number',default:6,min:1,max:168},{key:'overlapMinutes',label:'Overlap (minutes)',type:'number',default:30,min:0,max:1440},{key:'backfillIntervalMinutes',label:'Historical retrieval interval (minutes)',type:'number',default:60,min:10,max:10080}]};
 session.fetch.mockResolvedValue({ok:true,status:200,json:async()=>({...metadata,templates:[climate,...metadata.templates]})});
 render(<ImportsHarness webId="https://pod.example/a/profile/card#me"/>);const add=screen.getByRole('button',{name:'Add connection'});await waitFor(()=>expect(add).toBeEnabled());fireEvent.click(add);
 fireEvent.change(screen.getByLabelText('Saved Pod access'),{target:{value:'sample'}});
 expect(screen.getByLabelText('Source API key')).toBeRequired();expect(screen.getByLabelText('Source API key')).toHaveValue('');expect(screen.getByLabelText('Client secret')).not.toBeRequired();
 expect(screen.getByText(/Current readings come from Cismet/)).toBeInTheDocument();expect(screen.getByLabelText('Initial history (hours)')).toHaveValue(24);
 fireEvent.change(screen.getByLabelText('Source API key'),{target:{value:'test-source-key'}});fireEvent.click(screen.getByRole('button',{name:'Test and preview'}));
 await waitFor(()=>expect(connectionWorkerCall).toHaveBeenCalledWith(expect.anything(),expect.anything(),'imports',expect.objectContaining({action:'preview',draft:expect.objectContaining({provider:'wuppertal-climate',credentialImportId:'sample',credentials:{sourceSecret:'test-source-key'}})})));
});
