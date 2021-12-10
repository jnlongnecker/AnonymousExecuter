// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const cp = require('child_process');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */

const fileState = {
	valid: 0,
	noFile: 1,
	empty: 2,
	anonOnly: 3,
	configOnly: 4
}

function activate(context) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Anonymous Apex Executer Activated');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let execute = vscode.commands.registerCommand('anonymous-executor.executeAnonymous', function () {
		// The code you place here will be executed every time your command is executed

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Running Anonymous Apex"
		}, () => executeAnonApex());
	});

	let setup = vscode.commands.registerCommand('anonymous-executor.doSetup', function () {
		console.log('Logging for Setup');
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Performing file setup"
		}, () => performSetup())
	});

	context.subscriptions.push(execute);
	context.subscriptions.push(setup);
}

const performSetup = async () => {
	let response = await vscode.workspace.fs.readDirectory(vscode.workspace.workspaceFolders[0].uri);
	let fsResult = await getFileSetupState(response)
	let displayMessage;
	switch (fsResult) {
		case fileState.empty:
			displayMessage = 'A folder "anonymous" has been created with all files.'
			createAnonFile();
			break;
		case fileState.noFile:
			displayMessage = 'An .apex and config file have been created in the "anonymous" folder.';
			createAnonFile();
			createDefaultConfig();
			break;
		case fileState.anonOnly:
			displayMessage = 'A config file has been created in the "anonymous" folder.';
			createDefaultConfig();
			break;
		case fileState.configOnly:
			displayMessage = 'An .apex file has been created in the "anonymous" folder.';
			createAnonFile();
			break;
		case fileState.valid:
			displayMessage = 'File system is already set up properly, no changes made.';
			break;
	}
	vscode.window.showInformationMessage(displayMessage);
}

const createAnonFile = async () => {
	let fileUri = vscode.Uri.file(vscode.workspace.workspaceFolders[0].uri.path + '/anonymous/anon.apex');
	let rawText = '// Write your anonymous apex in this file and run the Execute Anonymous Apex command to run the code from your org.';
	let contents = Buffer.from(rawText, 'utf8');
	return await vscode.workspace.fs.writeFile(fileUri, Uint8Array.from(contents));
}

const createDefaultConfig = async () => {
	let fileUri = vscode.Uri.file(vscode.workspace.workspaceFolders[0].uri.path + '/anonymous/aexec-config.json');
	let rawText = '{\n\t"filterKeys": [\n\t\t"USER_DEBUG",\n\t\t"ERROR"\n\t]\n}';
	let contents = Buffer.from(rawText, 'utf8');
	return await vscode.workspace.fs.writeFile(fileUri, Uint8Array.from(contents));
}

const getFileSetupState = async (currentFolders) => {
	for (let fsItem of currentFolders) {
		if (fsItem[0] === 'anonymous') {
			let anonymousUri = vscode.Uri.file(vscode.workspace.workspaceFolders[0].uri.path + '/anonymous');
			let anonDirectory = await vscode.workspace.fs.readDirectory(anonymousUri);
			let hasAnon = hasFile(anonDirectory, 'anon.apex');
			let hasConfig = hasFile(anonDirectory, 'aexec-config.json');

			if (hasAnon && hasConfig) return fileState.valid;
			if (hasAnon) return fileState.anonOnly;
			if (hasConfig) return fileState.configOnly;
			return fileState.noFile;
		}
	}
	return fileState.empty;
}

const hasFile = (directoryContents, fileName) => {
	for (let file of directoryContents) {
		if (file[0] === fileName)
			return true;
	}
	return false;
}

const executeAnonApex = async () => {
	let defaultUsername = await getDefaultUsername();
	let directory = vscode.workspace.workspaceFolders[0].uri.fsPath + `\\anonymous\\anon.apex`;
	let command = `sfdx force:apex:execute -f ${directory} -u ${defaultUsername}`;

	let result = await execShell(command);

	let filteredLog = await filterLog(result);

	await writeLog(filteredLog);
	vscode.window.showInformationMessage('Anonymous Apex completed. View the log in anonymous/log.txt.');
}

const writeLog = async rawString => {
	let fileUri = vscode.Uri.file(vscode.workspace.workspaceFolders[0].uri.path + '/anonymous/log.txt');
	let contents = Buffer.from(rawString, 'utf8');
	return await vscode.workspace.fs.writeFile(fileUri, Uint8Array.from(contents));
}

const filterLog = async log => {
	let allLines = log.split('\n');
	let startIndex = 1;

	while (!allLines[startIndex].match('\\d\\d:\\d\\d:\\d\\d.*')) {
		startIndex++;
	}
	let filteredLog = '';
	let filterPattern = await getRegexFromConfig();
	let previousLineMatched = false;
	for (let index = startIndex; index < allLines.length; index++) {
		if (allLines[index] === '') continue;

		if (allLines[index].match(filterPattern)) {
			filteredLog += allLines[index] + '\n';
			previousLineMatched = true;
			continue;
		}
		if (!allLines[index].match('\\d\\d:\\d\\d:\\d\\d.*') && previousLineMatched) {
			filteredLog += allLines[index] + '\n';
			previousLineMatched = true;
			continue;
		}
		previousLineMatched = false;
	}
	return filteredLog.substring(0, filteredLog.length - 1);
}

const execShell = (/** @type {string} */ cmd) =>
	new Promise((resolve, reject) => {
		cp.exec(cmd, (err, out) => {
			if (err) {
				return reject(err);
			}
			return resolve(out);
		});
	});

const getDefaultUsername = async () => {
	let configPath = vscode.workspace.workspaceFolders[0].uri.path + '/.sfdx/sfdx-config.json';
	let configUri = vscode.Uri.file(configPath);
	let configContents = (await vscode.workspace.fs.readFile(configUri)).toString();
	return JSON.parse(configContents).defaultusername;
}

const getRegexFromConfig = async () => {
	let configPath = vscode.workspace.workspaceFolders[0].uri.path + '/anonymous/aexec-config.json';
	let configUri = vscode.Uri.file(configPath);
	let configContents = (await vscode.workspace.fs.readFile(configUri)).toString();
	let keywords = JSON.parse(configContents).filterKeys;
	let regex = '';
	for (let key of keywords) {
		regex += `.*${key}.*|`;
	}

	return regex.substring(0, regex.length - 1);
}

// this method is called when your extension is deactivated
function deactivate() { }

module.exports = {
	activate,
	deactivate
}
