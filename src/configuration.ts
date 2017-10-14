import * as vs from 'vscode';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as path from 'path';
import Rubocop from './rubocop';

export interface RubocopConfig {
    command: string;
    onSave: boolean;
    configFilePath: string;
    useBundler: boolean;
}

export const onDidChangeConfiguration: (rubocop: Rubocop) => () => void = (rubocop) => {
    return () => rubocop.config = getConfig();
};

/**
 * Read the workspace configuration for 'ruby.rubocop' and return a RubocopConfig.
 * @return {RubocopConfig} config object
 */
export const getConfig: () => RubocopConfig = () => {
    const cmd = (process.platform === 'win32') ? 'rubocop.bat' : 'rubocop';
    const conf = vs.workspace.getConfiguration('ruby.rubocop');
    let useBundler;
    let path = conf.get('executePath', '');
    let command;

    // if executePath is present, use it.
    if (path.length !== 0) {
        command = path + cmd;
    } else if (detectBundledRubocop()) {
        useBundler = true;
        command = `bundle exec ${cmd}`;
    } else {
        path = autodetectExecutePath(cmd);
        if (0 === path.length) {
            vs.window.showWarningMessage('execute path is empty! please check ruby.rubocop.executePath');
        }
        command = path + cmd;
    }
    return {
        useBundler,
        command,
        configFilePath: conf.get('configFilePath', ''),
        onSave: conf.get('onSave', true),
    };
};

const detectBundledRubocop: () => boolean = () => {
    try {
        cp.execSync('bundle show rubocop', { cwd: vs.workspace.rootPath });
        console.log('bundled rubocop found');
        return true;
    } catch (e) {
        console.log(`bundled rubocop not found -${e}`);
        return false;
    }
};

const autodetectExecutePath: (cmd: string) => string = () => {
    const key: string = 'PATH';
    let paths = process.env[key];
    if (!paths) {
        return '';
    }

    let pathparts = paths.split(path.delimiter);
    for (let i = 0; i < pathparts.length; i++) {
        let binpath = path.join(pathparts[i], this.command);
        if (fs.existsSync(binpath)) {
            return pathparts[i] + path.sep;
        }
    }

    return '';
};
