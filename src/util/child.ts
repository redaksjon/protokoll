#!/usr/bin/env node
import child_process, { exec } from 'node:child_process';
import util from 'node:util';

export async function run(command: string, options: child_process.ExecOptions = {}): Promise<{ stdout: string; stderr: string }> {
    const execPromise = util.promisify(exec);
    const optionsWithEncoding = { ...options, encoding: 'utf8' as const };
    const result = await execPromise(command, optionsWithEncoding);
    return {
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString()
    };
}