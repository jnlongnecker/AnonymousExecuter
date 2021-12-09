// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const cp = require('child_process');
const { fstat } = require('fs');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */

const fileState = {
	valid: 0,
	noFile: 1,
	empty: 2
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
		}, () => execShell('echo testing', vscode.window.showInformationMessage));
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
			displayMessage = 'A folder and .apex file have been created.'
			createAnonFile();
			break;
		case fileState.noFile:
			displayMessage = 'A .apex file has been created in the "anonymous" folder.';
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

const getFileSetupState = async (currentFolders) => {
	for (let fsItem of currentFolders) {
		if (fsItem[0] === 'anonymous') {
			let anonymousUri = vscode.Uri.file(vscode.workspace.workspaceFolders[0].uri.path + '/anonymous');
			let anonDirectory = await vscode.workspace.fs.readDirectory(anonymousUri);
			if (hasAnonymousFile(anonDirectory)) {
				return fileState.valid;
			}
			return fileState.noFile;
		}
	}
	return fileState.empty;
}

const hasAnonymousFile = (directoryContents) => {
	for (let file of directoryContents) {
		if (file[0] === 'anon.apex')
			return true;
	}
	return false;
}

const execShell = (/** @type {string} */ cmd, callback) =>
	new Promise((resolve, reject) => {
		cp.exec(cmd, (err, out) => {
			if (err) {
				callback(err);
				return reject(err);
			}
			callback(out);
			return resolve(out);
		});
	});

// this method is called when your extension is deactivated
function deactivate() { }

module.exports = {
	activate,
	deactivate
}
