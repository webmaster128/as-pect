
import * as fs from "fs";
import { performance } from "perf_hooks";
import * as path from "path";
import chalk from "chalk";
import { IAspectExports, TestReporter, TestContext, IWarning } from "@as-pect/core";
import { IConfiguration, ICompilerFlags } from "./util/IConfiguration";
import glob from "glob";
import { collectReporter } from "./util/collectReporter";
import { getTestEntryFiles } from "./util/getTestEntryFiles";
import { Options } from "./util/CommandLineArg";
import { writeFile } from "./util/writeFile";
import { ICommand } from "./worklets/ICommand";
import { timeDifference }   from "@as-pect/core/lib/util/timeDifference";

/**
 * @ignore
 * This method actually runs the test suites in sequential order synchronously.
 *
 * @param {Options} cliOptions - The command line arguments.
 * @param {string[]} compilerArgs - The `asc` compiler arguments.
 */
export function run(cliOptions: Options, compilerArgs: string[]): void {
  const start = performance.now();
  const worklets: any[] = [];

  /** Collect the assemblyscript module path. */
  const assemblyScriptFolder = cliOptions.compiler.startsWith(".")
    ? path.join(process.cwd(), cliOptions.compiler)
    : cliOptions.compiler;

  /**
   * Create the compiler worklets if the worker flag is not 0.
   */
  if (cliOptions.workers !== 0) {
    const Worker = require("worker_threads").Worker;

    if (!isFinite(cliOptions.workers)) {
      console.error(
        chalk`{red [Error]} Invalid worker configuration: {yellow ${cliOptions.workers.toString()}}`,
      );
      process.exit(1);
    }

    const workletPath = require.resolve("./worklets/compiler");
    for (let i = 0; i < cliOptions.workers; i++) {
      const worklet = new Worker(workletPath, {
        workerData: {
          assemblyScriptFolder,
        },
      });
      worklets.push(worklet);
    }

    console.log(
      chalk`{bgWhite.black [Log]} Using experimental compiler worklets: {yellow ${worklets.length.toString()} worklets}`,
    );
  }

  /**
   * Instead of using `import`, the strategy is to encourage node to start the testing process
   * as soon as possible. Calling require and measuring the performance of compiler loading shows
   * developers a meaningful explaination of why it takes a few seconds for the software to start
   * running.
   */
  console.log(chalk`{bgWhite.black [Log]} Loading asc compiler`);
  let asc: any;
  let instantiateSync: any;
  let parse: any;
  let exportTable: boolean = false;
  try {
    let folderUsed = "cli";
    try {
    /** Next, obtain the compiler, and assert it has a main function. */
    asc = require(path.join(assemblyScriptFolder, "cli", "asc"));
    } catch (ex) {
      try {
        folderUsed = "dist";
        asc = require(path.join(assemblyScriptFolder, "dist", "asc"));
      } catch (ex) {
        throw ex;
      }
    }
    if (!asc) {
      throw new Error(`${cliOptions.compiler}/${folderUsed}/asc has no exports.`);
    }
    if (!asc.main) {
      throw new Error(
        `${cliOptions.compiler}/${folderUsed}/asc does not export a main() function.`,
      );
    }

    /** Next, collect the loader, and assert it has an instantiateSync method. */
    let loader = require(path.join(assemblyScriptFolder, "lib", "loader"));
    if (!loader) {
      throw new Error(`${cliOptions.compiler}/lib/loader has no exports.`);
    }
    if (!loader.instantiateSync) {
      throw new Error(
        `${cliOptions.compiler}/lib/loader does not export an instantiateSync() method.`,
      );
    }
    instantiateSync = loader.instantiateSync;

    /** Finally, collect the cli options from assemblyscript. */
    let options = require(path.join(
      assemblyScriptFolder,
      "cli",
      "util",
      "options",
    ));
    if (!options) {
      throw new Error(`${cliOptions.compiler}/cli/util/options exports null`);
    }

    if (!options.parse) {
      throw new Error(
        `${cliOptions.compiler}/cli/util/options does not export a parse() method.`,
      );
    }

    if (asc.options.exportTable) {
      exportTable = true;
    }
    parse = options.parse;
  } catch (ex) {
    console.error(
      chalk`{bgRedBright.black [Error]} There was a problem loading {bold [${cliOptions.compiler}]}.`,
    );
    console.error(ex);
    process.exit(1);
  }
  console.log(
    chalk`{bgWhite.black [Log]} Compiler loaded in {yellow ${timeDifference(
      performance.now(),
      start,
    ).toString()}ms}.`,
  );

  // obtain the configuration file
  const configurationPath = path.resolve(process.cwd(), cliOptions.config);
  console.log(
    chalk`{bgWhite.black [Log]} Using configuration {yellow ${configurationPath}}`,
  );

  let configuration: IConfiguration = {};

  try {
    configuration = require(configurationPath) || {};
  } catch (ex) {
    console.error("");
    console.error(
      chalk`{bgRedBright.black [Error]} There was a problem loading {bold [${configurationPath}]}.`,
    );
    console.error(ex);
    process.exit(1);
  }

  // configuration must be an object
  if (!configuration) {
    console.error(
      chalk`{bgRedBright.black [Error]} Configuration at {bold [${configurationPath}]} is null or not an object.`,
    );
    process.exit(1);
  }

  const include: string[] = configuration.include || [
    "assembly/__tests__/**/*.spec.ts",
  ];
  const add: string[] = configuration.add || [
    "assembly/__tests__/**/*.include.ts",
  ];

  // parse passed cli compiler arguments and determine if there are any bad arguments.
  if (compilerArgs.length > 0) {
    const output = parse(compilerArgs, asc.options);
    // if there are any unknown flags, report them and exit 1
    if (output.unknown.length > 0) {
      console.error(
        chalk`{bgRedBright.black [Error]} Unknown compiler arguments {bold.yellow [${output.unknown.join(
          ", ",
        )}]}.`,
      );
      process.exit(1);
    }
  }

  // Create the compiler flags
  const flags: ICompilerFlags = Object.assign({}, configuration.flags, {
    "--validate": [],
    "--debug": [],
    "--binaryFile": ["output.wasm"],
    "--explicitStart": [],
  });

  /**
   * Check to see if rtrace is disabled.
   */
  if (cliOptions.nortrace) {
    configuration.nortrace = true;
  }

  /** RTrace is enabled, and the --use ASC_RTRACE=1 cli option must be present. */
  if (!configuration.nortrace) {
    if (!flags["--use"] || flags["--use"].includes("ASC_RTRACE=1") || !compilerArgs.includes("ASC_RTRACE=1")) {
      if (!flags["--use"]) {
        flags["--use"] = ["ASC_RTRACE=1"];
        // inspect to see if the flag is used already
      } else if (!flags["--use"].includes("ASC_RTRACE=1")) {
        flags["--use"].push("--use", "ASC_RTRACE=1")
      }
    }
  }

  if (exportTable) {
    flags["--exportTable"] = [];
  }

  /** It's useful to notify the user that optimizations will make test compile times slower. */
  if (
    flags.hasOwnProperty("-O3") ||
    flags.hasOwnProperty("-O2") ||
    flags.hasOwnProperty("--optimize") ||
    compilerArgs.includes("-O3") ||
    compilerArgs.includes("-O2") ||
    compilerArgs.includes("--optimize")
  ) {
    console.log(
      chalk`{yellow [Warning]} Using optimizations. This may result in slow test compilation times.`,
    );
  }

  const disclude: RegExp[] = configuration.disclude || [];

  // if a reporter is specified in cli arguments, override configuration
  const reporter: TestReporter =
    configuration.reporter || collectReporter(cliOptions);

  if (configuration.performance) {
    Object.getOwnPropertyNames(configuration.performance).forEach(option => {
      if (cliOptions.changed.has("performance." + option)) {
        cliOptions.performance[option] = configuration.performance![option]!;
      }
    });
  }
  const performanceConfiguration = cliOptions.performance;

  // include all the file globs
  console.log(
    chalk`{bgWhite.black [Log]} Including files: ${include.join(", ")}`,
  );

  // Create the test and group matchers
  const testRegex = new RegExp(cliOptions.test, "i");
  configuration.testRegex = testRegex;
  console.log(
    chalk`{bgWhite.black [Log]} Running tests that match: {yellow ${testRegex.source}}`,
  );

  const groupRegex = new RegExp(cliOptions.group, "i");
  configuration.groupRegex = groupRegex;
  console.log(
    chalk`{bgWhite.black [Log]} Running groups that match: {yellow ${groupRegex.source}}`,
  );

  /**
   * Check to see if the binary files should be written to the fileSystem.
   */
  const outputBinary: boolean = !!(
    cliOptions.outputBinary || configuration.outputBinary
  );
  if (outputBinary) {
    console.log(chalk`{bgWhite.black [Log]} Outputing Binary *.wasm files.`);
  }

  /**
   * If rtrace is enabled, add `--use ASC_RTRACE=1` to the command line parameters.
   */
  if (configuration.nortrace) {
    console.log(chalk`{bgWhite.black [Log]} Reference Tracing is disabled.`);
  }

  /**
   * Check to see if the tests should be run in the first place.
   */
  const runTests: boolean = !cliOptions.norun;
  if (!runTests) {
    console.log(
      chalk`{bgWhite.black [Log]} Not running tests, only outputting files.`,
    );
  }

  if (compilerArgs.length > 0) {
    console.log(
      chalk`{bgWhite.black [Log]} Adding compiler arguments: ` +
        compilerArgs.join(" "),
    );
  }

  const addedTestEntryFiles: Set<string> = new Set<string>();

  /** Get all the test entry files. */
  const testEntryFiles = getTestEntryFiles(cliOptions, include, disclude);

  for (const pattern of add) {
    // push all the added files to the added entry point list
    for (const entry of glob.sync(pattern)) {
      addedTestEntryFiles.add(entry);
    }
  }

  // must include the assembly/index.ts file located in the assembly package
  const entryPath = require.resolve("@as-pect/assembly/assembly/index.ts");
  const relativeEntryPath = path.relative(process.cwd(), entryPath);

  // add the relativeEntryPath of as-pect to the list of compiled files for each test
  addedTestEntryFiles.add(relativeEntryPath);

  // Create a test runner, and run each test
  let count = testEntryFiles.size;

  // create the array of compiler flags from the flags object
  const flagList: string[] = Object.entries(flags).reduce(
    (args: string[], [flag, options]) => args.concat(flag, options),
    [],
  ).concat(compilerArgs);

  let testCount = 0;
  let successCount = 0;
  let groupSuccessCount = 0;
  let groupCount = 0;
  let errors: IWarning[] = [];
  let filePromises: Promise<void>[] = [];
  let failed = false;

  const folderMap = new Map<string, string[]>();
  const fileMap = new Map<string, string>();
  console.log(chalk`{bgWhite.black [Log]} Effective command line args:`);
  console.log(
    chalk`  {green [TestFile.ts]} {yellow ${Array.from(
      addedTestEntryFiles,
    ).join(" ")}} ${flagList.join(" ")}`,
  );

  // add a line seperator between the next line and this line
  console.log("");

  const finalCompilerArguments = [
    ...Array.from(addedTestEntryFiles),
    ...flagList,
  ];

  function runBinary(
    error: Error | null,
    file: string,
    binary: Uint8Array,
  ): number {
    // if there are any compilation errors, stop the test suite
    if (error) {
      console.error(
        chalk`{red [Error]} There was a compilation error when trying to create the wasm binary for file: ${file}.`,
      );
      console.error(error);
      return process.exit(1);
    }

    // if the binary wasn't emitted, stop the test suite
    if (!binary) {
      console.error(
        chalk`{red [Error]} There was no output binary file: ${file}. Did you forget to emit the binary with {yellow --binaryFile}?`,
      );
      return process.exit(1);
    }

    if (runTests) {
      // create a test runner
      const runner = new TestContext({
        fileName: file,
        groupRegex: configuration.groupRegex,
        testRegex: configuration.testRegex,
        performanceConfiguration,
        reporter,
        binary
      });

      // detect custom imports
      const customImportFileLocation = path.resolve(
        path.join(
          path.dirname(file),
          path.basename(file, path.extname(file)) + ".imports.js",
        ),
      );
      const imports = runner.createImports(
        (fs.existsSync(customImportFileLocation)
          ? require(customImportFileLocation)
          : configuration!.imports) || {},
      );

      // instantiate the module
      const wasm: IAspectExports = instantiateSync(binary, imports);

      if (runner.errors.length > 0) {
        errors.push(...runner.errors);
      } else {
        // call run buffer because it's already compiled
        runner.run(wasm);
        testCount += runner.testGroups.reduce(
          (left, right) => left + right.tests.length,
          0,
        );
        successCount += runner.testGroups.reduce(
          (left, right) => left + right.tests.filter(e => e.pass).length,
          0,
        );
        groupCount += runner.testGroups.length;
        groupSuccessCount = runner.testGroups.reduce(
          (left, right) => left + (right.pass ? 1 : 0),
          groupSuccessCount,
        );
        errors.push(...runner.errors); // if there are any runtime allocation errors add them
      }
    }

    count -= 1;

    // if any tests failed, and they all ran, exit(1)
    if (count === 0) {
      if (runTests) {
        const end = performance.now();
        failed = testCount !== successCount || errors.length > 0;
        const result = failed ? chalk`{red ✖ FAIL}` : chalk`{green ✔ PASS}`;
        console.log("~".repeat(Math.max(process.stdout.columns - 10, 10)));

        for (const error of errors) {
          console.log(chalk`
 [Error]: {red ${error.type}}: ${error.message}
 [Stack]: {yellow ${error.stackTrace.split("\n").join("\n            ")}}
`);
        }
        console.log(chalk`
  [Result]: ${result}
   [Files]: ${testEntryFiles.size.toString()} total
  [Groups]: ${groupCount.toString()} count, ${groupSuccessCount.toString()} pass
   [Tests]: ${successCount.toString()} pass, ${(
          testCount - successCount
        ).toString()} fail, ${testCount.toString()} total
    [Time]: ${timeDifference(end, start).toString()}ms`);

        if (worklets.length > 0) {
          for (const worklet of worklets) {
            worklet.terminate();
          }
        }
      }

      Promise.all(filePromises).then(() => {
        if (failed) process.exit(1);
      });
    }
    return 0;
  }

  if (worklets.length > 0) {
    let i = 0;
    let length = worklets.length;
    for (const entry of Array.from(testEntryFiles)) {
      const workload: ICommand = {
        type: "compile",
        props: {
          file: entry,
          args: [entry, ...finalCompilerArguments],
          outputBinary,
        },
      };

      worklets[i % length].postMessage(workload);
    }

    worklets.forEach(worklet => {
      worklet.on("message", (e: ICommand) => {
        runBinary(e.props.error, e.props.file, e.props.binary);
      });
    });
  } else {
    // for each file, synchronously run each test
    Array.from(testEntryFiles).forEach((file: string) => {
      let binary: Uint8Array;

      asc.main(
        [file, ...finalCompilerArguments],
        {
          stdout: process.stdout as any, // use any type to quelch error
          stderr: process.stderr as any,
          listFiles(dirname: string, baseDir: string): string[] {
            const folder = path.join(baseDir, dirname);
            if (folderMap.has(folder)) {
              return folderMap.get(folder)!;
            }

            try {
              const results = fs
                .readdirSync(folder)
                .filter(file => /^(?!.*\.d\.ts$).*\.ts$/.test(file));
              folderMap.set(folder, results);
              return results;
            } catch (e) {
              return [];
            }
          },
          readFile(filename: string, baseDir: string) {
            const fileName = path.join(baseDir, filename);
            if (fileMap.has(fileName)) {
              return fileMap.get(fileName)!;
            }

            try {
              const contents = fs.readFileSync(fileName, { encoding: "utf8" });
              fileMap.set(fileName, contents);
              return contents;
            } catch (e) {
              return null;
            }
          },
          writeFile(name: string, contents: Uint8Array, baseDir:string = ".") {
            const ext = path.extname(name);

            // get the wasm file
            if (ext === ".wasm") {
              binary = contents;
              if (!outputBinary) return;
            } else if (ext === ".ts") {
              filePromises.push(writeFile(path.join(baseDir, name), contents));
              return;
            }

            const outfileName = path.join(
              path.dirname(file),
              path.basename(file, path.extname(file)) + ext,
            );
            filePromises.push(writeFile(outfileName, contents));
          },
        },
        (error: any) => runBinary(error, file, binary),
      );
    });
  }
}
