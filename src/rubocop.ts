import { RubocopOutput, RubocopFile, RubocopOffense } from './rubocopOutput';
import { TaskQueue, Task } from './taskQueue';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

// this is never explicitly used anywhere- maybe implicitly used by vscode?
interface RubocopConfig {
    executePath: string;
    configFilePath: string;
    options: string[];
    useBundler: boolean;
}

function isFileUri(uri: vscode.Uri): boolean {
    return uri.scheme === 'file';
}

export default class Rubocop {
    private diag: vscode.DiagnosticCollection;
    private path: string;
    private command: string;
    private additionalArguments: string[];
    private configPath: string;
    private onSave: boolean;
    private useBundler: boolean;
    private taskQueue: TaskQueue = new TaskQueue();

    constructor(
        diagnostics: vscode.DiagnosticCollection,
        additionalArguments: string[] = [],
        platform: NodeJS.Platform = process.platform,
    ) {
        this.diag = diagnostics;
        this.command = (platform === 'win32') ? 'rubocop.bat' : 'rubocop';
        this.additionalArguments = additionalArguments;
        this.resetConfig();
    }

    public execute(document: vscode.TextDocument, onComplete?: () => void): void {
        if (document.languageId !== 'ruby' || document.isUntitled || !isFileUri(document.uri)) {
            // git diff has ruby-mode. but it is Untitled file.
            return;
        }

        this.resetConfig();

        if (!this.useBundler && (!this.path || 0 === this.path.length)) {
            vscode.window.showWarningMessage('execute path is empty! please check ruby.rubocop.executePath/useBundler config');
            return;
        }

        const fileName = document.fileName;
        const uri = document.uri;
        let currentPath = vscode.workspace.rootPath;
        console.log(currentPath);
        if (!currentPath) {
            currentPath = path.dirname(fileName);
        }

        let onDidExec = (error: Error, stdout: string, stderr: string) => {
            if (this.hasError(error, stderr)) {
                return;
            }

            this.diag.delete(uri);
            let rubocop = this.parse(stdout);

            if (rubocop === undefined || rubocop === null) {
                return;
            }

            let entries: [vscode.Uri, vscode.Diagnostic[]][] = [];
            rubocop.files.forEach((file: RubocopFile) => {
                let diagnostics = [];
                file.offenses.forEach((offence: RubocopOffense) => {
                    const loc = offence.location;
                    const range = new vscode.Range(
                        loc.line - 1, loc.column - 1, loc.line - 1, loc.length + loc.column - 1);
                    const sev = this.severity(offence.severity);
                    const message = `${offence.message} (${offence.severity}:${offence.cop_name})`;
                    const diagnostic = new vscode.Diagnostic(
                        range, message, sev);
                    diagnostics.push(diagnostic);
                });
                entries.push([uri, diagnostics]);
            });

            this.diag.set(entries);
        };

        let executeRubocop: (opts: cp.ExecFileOptions, cb: (err: Error, stdout: string, stderr: string) => void) => cp.ChildProcess;
        const args = this.commandArguments(fileName);
        if (this.useBundler) {
            const cmd = ['bundle', 'exec', this.command].concat(args).join(' ');
            console.log(cmd);
            console.log('********');
            executeRubocop = (options, callback) => cp.exec(cmd, options, callback);
        } else {
            const executeFile = this.path + this.command;
            executeRubocop = (options, callback) => cp.execFile(executeFile, args, options, callback);
        }

        let task = new Task(uri, token => {
            let process = executeRubocop({ cwd: currentPath }, (error, stdout, stderr) => {
                if (token.isCanceled) {
                    return;
                }
                onDidExec(error, stdout, stderr);
                token.finished();
                if (onComplete) {
                    onComplete();
                }
            });
            return () => process.kill();
        });
        this.taskQueue.enqueue(task);
    }

    public get isOnSave(): boolean {
        return this.onSave;
    }

    public clear(document: vscode.TextDocument): void {
        let uri = document.uri;
        if (isFileUri(uri)) {
            this.taskQueue.cancel(uri);
            this.diag.delete(uri);
        }
    }

    // extract argument to an array
    protected commandArguments(fileName: string): string[] {
        let commandArguments = [fileName, '--format', 'json', '--force-exclusion'];

        if (this.configPath !== '') {
            if (fs.existsSync(this.configPath)) {
                const config = ['--config', this.configPath];
                commandArguments = commandArguments.concat(config);
            } else {
                vscode.window.showWarningMessage(`${this.configPath} file does not exist. Ignoring...`);
            }
        }

        return commandArguments.concat(this.additionalArguments);
    }

    // parse rubocop(JSON) output
    private parse(output: string): RubocopOutput | null {
        let rubocop: RubocopOutput;
        if (output.length < 1) {
            let message = `command ${this.path}${this.command} returns empty output! please check configuration.`;
            vscode.window.showWarningMessage(message);

            return null;
        }

        try {
            rubocop = JSON.parse(output);
        } catch (e) {
            if (e instanceof SyntaxError) {
                let regex = /[\r\n \t]/g;
                let message = output.replace(regex, ' ');
                let errorMessage = `Error on parsing output (It might non-JSON output) : "${message}"`;
                vscode.window.showWarningMessage(errorMessage);

                return null;
            }
        }

        return rubocop;
    }

    // checking rubocop output has error
    private hasError(error: Error, stderr: string): boolean {
        let errorOutput = stderr.toString();
        if (error && (<any>error).code === 'ENOENT') {
            vscode.window.showWarningMessage(`${this.path} + ${this.command} is not executable`);
            return true;
        } else if (error && (<any>error).code === 127) {
            vscode.window.showWarningMessage(stderr);
            console.log(error.message);
            return true;
        } else if (errorOutput.length > 0) {
            vscode.window.showErrorMessage('UHHHHHHHHHHHH' + stderr);
            console.log(this.path + this.command);
            console.log(errorOutput);
            return true;
        }

        return false;
    }

    /**
     * Read the workspace configuration for 'ruby.rubocop' and set the
     * `path`, `configPath`, and `onSave` properties.
     *
     * @todo Refactor Rubocop to use vscode.workspace.onDidChangeConfiguration
     *   rather than running Rubocop.resetConfig every time the Rubocop binary is executed
     */
    private resetConfig(): void {
        const conf = vscode.workspace.getConfiguration('ruby.rubocop');
        this.path = conf.get('executePath', '');
        this.useBundler = conf.useBundler;
        // try to autodetect the path (if it's not specified explicitly)
        if (!this.path || 0 === this.path.length) {
            this.path = this.autodetectExecutePath();
        }
        this.configPath = conf.get('configFilePath', '');
        this.onSave = conf.get('onSave', true);
    }

    private severity(sev: string): vscode.DiagnosticSeverity {
        switch (sev) {
            case 'refactor': return vscode.DiagnosticSeverity.Hint;
            case 'convention': return vscode.DiagnosticSeverity.Information;
            case 'warning': return vscode.DiagnosticSeverity.Warning;
            case 'error': return vscode.DiagnosticSeverity.Error;
            case 'fatal': return vscode.DiagnosticSeverity.Error;
            default: return vscode.DiagnosticSeverity.Error;
        }
    }

    private autodetectExecutePath(): string {
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
    }
}
