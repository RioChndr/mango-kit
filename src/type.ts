// deno-lint-ignore-file ban-types
import { Router } from "oak";

export interface ControllerI {
	initRouter(): Promise<Router> | Router
}

export type NonMethodKeys<T> = {[P in keyof T]: T[P] extends Function ? never : P }[keyof T];  
export type RemoveMethods<T> = Pick<T, NonMethodKeys<T>>; 

export type ControllerType<Args extends any[] = any[]> = new(...args: Args) => ControllerI

/** Known error that should able show to user */
export class ResponseError extends Error {
	code?: number;
	data?: Record<string, any>;
	constructor(message: string, code?: number, data?: Record<string, any>){
		super(message as any);
		this.code = code;
		this.name = 'ResponseError';
		this.data = data;
	}
}

export class ResponseBody<T = any> {
	constructor(
		public data: T,
		public message?: string,
		public code?: number,
		public error?: Record<string, any>,
	){}
}