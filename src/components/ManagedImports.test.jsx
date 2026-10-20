import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
  render(<ManagedImports webId="https://pod.example/a/profile/card#me" />);
  fireEvent.click(await screen.findByRole('button', {
    name: /^Example import /
  }));
  fireEvent.change(screen.getByLabelText('Time (UTC)'), {
    target: {
      value: '11:30'
    }
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Save'
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
  const view = render(<ManagedImports webId="https://pod.example/a/profile/card#me" />);
  view.rerender(<ManagedImports webId="https://pod.example/b/profile/card#me" />);
  await act(async () => resolve({
    ok: true,
    json: async () => ({
      imports: [row]
    })
  }));
  expect(screen.queryByText('Example import')).not.toBeInTheDocument();
});
