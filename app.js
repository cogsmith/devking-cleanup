const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_RUN_ID = process.env.GITHUB_RUN_ID;
const GITHUB_WORKFLOW = process.env.GITHUB_WORKFLOW;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const GITHUB_REPOTEAM = GITHUB_REPOSITORY.split('/')[0];
const GITHUB_REPONAME = GITHUB_REPOSITORY.split('/')[1];
const REPO = { owner: GITHUB_REPOTEAM, repo: GITHUB_REPONAME };
const ACTIONDO = process.env.ACTIONDO || 'CLEANUP';

//

const fs = require('fs');
const _ = require('lodash');
const pino = require('pino');
const execa = require('execa');
const chalk = require('chalk');
const semver = require('semver');
const { Octokit } = require("@octokit/rest");

//

const octokit = new Octokit({ auth: GITHUB_TOKEN });

//

const App = {};

App.Args = { loglevel: 'trace', logfancy: true };
App.LogFancy = false; if (App.Args.logfancy) { App.LogFancy = { colorize: true, singleLine: true, translateTime: 'SYS:yyyy-mm-dd|HH:MM:ss', ignore: 'hostname,pid', messageFormat: function (log, key, label) { let msg = log.msg ? log.msg : ''; let logout = chalk.gray(App.Meta.NameTag); if (msg != '') { logout += ' ' + msg }; return logout; } }; }
App.Log = pino({ level: App.Args.loglevel, hooks: { logMethod: function (args, method) { if (args.length === 2) { args.reverse() } method.apply(this, args) } }, prettyPrint: App.LogFancy });
const LOG = App.Log; LOG.TRACE = LOG.trace; LOG.DEBUG = LOG.debug; LOG.INFO = LOG.info; LOG.WARN = LOG.warn; LOG.ERROR = LOG.error; LOG.FATAL = LOG.fatal;

const AppPackage = require('./package.json');
const AppMeta = _.merge(AppPackage, { Version: AppPackage.version || process.env.npm_package_version || '0.0.0', Name: AppPackage.namelong || AppPackage.name || 'App', NameTag: AppPackage.nametag || AppPackage.name.toUpperCase(), Info: AppPackage.description || '' });
AppMeta.Full = AppMeta.Name + ': ' + AppMeta.Info + ' [' + AppMeta.Version + ']';
App.Meta = AppMeta;

App.InfoDB = {}; App.Info = function (id) { let z = App.InfoDB[id]; if (!z) { return z; } else { return z.Type == 'FX' ? z.Value() : z.Value; } };
App.SetInfo = function (id, value) { if (typeof (value) == 'function') { return App.InfoDB[id] = { Type: 'FX', Value: value } } else { return App.InfoDB[id] = { Type: 'VALUE', Value: value } } };
App.SetInfo('Node.Args', process.argv.join(' '));
App.SetInfo('Node', require('os').hostname().toUpperCase() + ' : ' + process.pid + '/' + process.ppid + ' : ' + process.cwd() + ' : ' + process.version + ' : ' + require('os').version() + ' : ' + process.title);
App.SetInfo('App', App.Meta.Full);

//

App.Init = async function () {
    LOG.TRACE({ App: App });
    LOG.INFO(App.Meta.Full);
    LOG.DEBUG('Node.Info: ' + chalk.white(App.Info('Node')));
    LOG.DEBUG('Node.Args: ' + chalk.white(App.Info('Node.Args')));
    LOG.DEBUG('App.Init');

    //Object.keys(process.env).sort().forEach(x => { if (0 || x.startsWith('GITHUB')) { LOG.TRACE(x + ': ' + process.env[x]); } });

    LOG.DEBUG('App.InitDone');
    await App.Main();
}

App.Main = async function () {
    LOG.DEBUG('App.Main: ' + ACTIONDO);
    if (ACTIONDO == 'CLEANUP') { await App.DeletePastRuns(); }
    if (ACTIONDO == 'CLEANME') { await App.DeletePastRuns(GITHUB_WORKFLOW); }
    if (ACTIONDO == 'NUKETAGS') { await App.NukeTags(); }
}

//

App.NukeTags = async function () {
    let releasesdata = await octokit.rest.repos.listReleases(REPO); //console.log(releasesdata);
    for (let i = 0; i < releasesdata.data.length; i++) {
        let x = releasesdata.data[i];
        LOG.DEBUG('DeleteRelease: ' + x.id);
        await octokit.rest.repos.deleteRelease({ owner: REPO.owner, repo: REPO.repo, release_id: x.id });
    }

    let cmds = [];
    let tagsdata = await octokit.rest.repos.listTags(REPO); //console.log(tagsdata);
    for (let i = 0; i < tagsdata.data.length; i++) {
        let x = tagsdata.data[i];
        LOG.DEBUG('DeleteTag: ' + x.name);
        let cmd = 'git push --delete origin ' + x.name + '';
        cmds.push(cmd);
    }
    App.RunCMDS(cmds);
}

App.DeletePastRuns = async function (workflow) {
    let runs = await octokit.rest.actions.listWorkflowRunsForRepo({ owner: REPO.owner, repo: REPO.repo, per_page: 100 });
    for (let i = 0; i < runs.data.workflow_runs.length; i++) {
        let run = runs.data.workflow_runs[i];
        if ((GITHUB_RUN_ID == run.id) || (workflow && run.name != workflow)) { continue; }
        LOG.INFO('DeleteRun: ' + run.id);
        try { await octokit.rest.actions.deleteWorkflowRun({ owner: REPO.owner, repo: REPO.repo, run_id: run.id }); } catch (ex) { LOG.ERROR(ex); }
    }
}

//

App.RunCMDS = function (cmds) {
    for (let i = 0; i < cmds.length; i++) {
        let cmd = cmds[i];
        let msg = 'App.CMD: ' + cmd;
        let run = false; try { run = execa.commandSync(cmd, { shell: true }); } catch (ex) { LOG.ERROR(ex); }
        if (!run) { continue; }
        if (run.stdout.trim().length > 0) {
            if (run.stdout.includes("\n")) { msg += "\n" + chalk.gray(run.stdout); }
            else { msg += chalk.gray(' => ') + chalk.white(run.stdout); }
        }
        LOG.DEBUG(msg);
    }
}

//

App.Init();