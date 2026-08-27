import { Prisma } from '@prisma/client';
export function validateScaleRange(minimum:string|null,maximum:string|null):boolean{if(minimum===null||maximum===null)return true;return new Prisma.Decimal(minimum).lte(new Prisma.Decimal(maximum));}
export function scaleValueInRange(value:string,minimum:string|null,maximum:string|null):boolean{const decimal=new Prisma.Decimal(value);return (minimum===null||decimal.gte(minimum))&&(maximum===null||decimal.lte(maximum));}
