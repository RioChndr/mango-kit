import { container } from "tsryinge";
import { ControllerType } from "./type.ts";
import * as _ from "lodash";

export function RegisterController(controller: ControllerType){
	container.register('Controllers', controller as any);
}

export function clearUndefined<T = Record<string, any>>(data: Object): T{
	return _.omitBy(data, (v:any) => _.isUndefined(v)||_.isNull(v)) as any;
}