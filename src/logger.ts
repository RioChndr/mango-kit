import { bgBlue, bgRed, bgYellow, blue, gray, green, red, white, yellow } from "fmt-colors";
import { injectable } from "tsryinge";

/**
 * Example inject this class
 * ```
  	@injectWithTransform(LoggerApp, LoggerTransform, {context: 'App Container'})
		readonly logger: LoggerApp,
 * ```
 */
@injectable()
export class LoggerApp {
  #log = console.log;

	context = 'App';

  info(...args: any[]) {
    this.#log(gray(this.wrapperMessage(args)));
  }
  error(...args: any[]) {
    this.#log(red(this.wrapperMessage(args)));
  }
	success(...args: any[]) {
		this.#log(green(this.wrapperMessage(args)));
	}
  warn(...args: any[]) {
    this.#log(yellow(this.wrapperMessage(args)));
  }
  debug(...args: any[]) {
    this.#log(blue(this.wrapperMessage(args)));
  }

	// preset color
	bgBlue(...args: any[]) {
		this.#log(bgBlue(white(this.wrapperMessage(args))));
	}
	bgYellow(...args: any[]) {
		this.#log(bgYellow(white(this.wrapperMessage(args))));
	}
	bgRed(...args: any[]) {
		this.#log(bgRed(white(this.wrapperMessage(args))));
	}

	wrapperMessage(args: any[]){
		const message = args.map(v => v.toString()).join(' ');

		const time = new Date().toISOString();
		
		if(this.context){
			return `${time} ${blue(`[${this.context}]`)} ${message}`
		}
		return `${time} ${message}`
	}
}

export class LoggerTransform {
	transform(logger: LoggerApp, options: {context: string}){
		logger.context = options.context;
		return logger;
	}
}
