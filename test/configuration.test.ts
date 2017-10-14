import { expect } from 'chai';
import * as vscode from 'vscode';
import { RubocopConfig, getConfig } from '../src/configuration';

describe('RubocopConfig', () => {
  let config: RubocopConfig;

  // beforeEach(() => {
  // });

  describe('getConfig', () => {
    describe('.useBundler', () => {
      xit('is set to the provided DiagnosticCollection', () => {
        // expect(instance).to.have.property('diag', diagnostics);
      });
    });

    describe('.command', () => {
      describe('when process.platform is "win32"', () => {
        beforeEach(() => {
          // dd
        });

        xit('is set to "rubocop.bat"', () => {
          // expect(instance).to.have.property('command', 'rubocop.bat');
        });
      });

      describe('when process.platform is not "win32"', () => {
        beforeEach(() => {
          // instance = new Rubocop(diagnostics, undefined, 'linux');
        });

        xit('is set to "rubocop"', () => {
          // expect(instance).to.have.property('command', 'rubocop');
        });
      });

      describe('useBundler', () => {
        it('is set', () => {
          // expect(instance).to.have.property('path');
        });
      });

      describe('.configPath', () => {
        it('is set', () => {
          // expect(instance).to.have.property('configPath');
        });
      });

      describe('.onSave', () => {
        it('is set', () => {
          // expect(instance).to.have.property('onSave');
        });
      });
    });
  });
});
