import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClinicalTestResponseType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DefinitionInput={name:string;responseType:ClinicalTestResponseType;unit?:string;options?:string[];scaleMin?:string;scaleMax?:string};
type ResultInput={testDefinitionId?:string;inlineDefinition?:DefinitionInput;measurementMethodId?:string;side?:'LEFT'|'RIGHT';observation?:string;value:unknown};
type EvaluationInput={bodyAreaOrType:string;protocolId?:string;conclusion?:string;results:ResultInput[]};

@Injectable()
export class EvaluationService {
 constructor(private readonly prisma:PrismaService){}
 private normalize(name:string){return name.trim().toLocaleLowerCase('es-AR').normalize('NFD').replace(/\p{Diacritic}/gu,'');}
 private decimal(value:unknown,code:string){try{return new Prisma.Decimal(String(value));}catch{throw new BadRequestException({code,message:'Invalid decimal value'});}}
 private validateDefinition(input:DefinitionInput){
  if(!input.name?.trim())throw new BadRequestException({code:'CLINIC_TEST_NAME_REQUIRED',message:'Test name is required'});
  if(input.responseType==='SCALE'&&input.scaleMin!=null&&input.scaleMax!=null&&this.decimal(input.scaleMin,'CLINIC_SCALE_INVALID').gt(this.decimal(input.scaleMax,'CLINIC_SCALE_INVALID')))throw new BadRequestException({code:'CLINIC_SCALE_RANGE_INVALID',message:'Scale minimum cannot exceed maximum'});
  if(input.responseType==='OPTIONS'&&(!input.options?.length||input.options.some(option=>!option.trim())))throw new BadRequestException({code:'CLINIC_OPTIONS_REQUIRED',message:'Options are required'});
 }
 private snapshot(def:{name:string;responseType:ClinicalTestResponseType;unit:string|null;options:Prisma.JsonValue;scaleMin:Prisma.Decimal|null;scaleMax:Prisma.Decimal|null}){return {snapshotVersion:1,name:def.name,responseType:def.responseType,unit:def.unit,options:def.options,scaleMin:def.scaleMin?.toString()??null,scaleMax:def.scaleMax?.toString()??null};}
 private validateValue(type:ClinicalTestResponseType,value:unknown,snapshot:ReturnType<EvaluationService['snapshot']>){
  if(type==='CATEGORICAL'&&!['POSITIVE','NEGATIVE','INCONCLUSIVE','NOT_PERFORMED'].includes(String(value)))throw new BadRequestException({code:'CLINIC_CATEGORICAL_VALUE_INVALID',message:'Invalid categorical value'});
  if(type==='TEXT'&&!String(value??'').trim())throw new BadRequestException({code:'CLINIC_TEXT_VALUE_REQUIRED',message:'Text result is required'});
  if(type==='OPTIONS'&&!(Array.isArray(snapshot.options)&&snapshot.options.includes(String(value))))throw new BadRequestException({code:'CLINIC_OPTION_VALUE_INVALID',message:'Invalid option'});
  if(type==='NUMERIC'||type==='SCALE'){const number=this.decimal(value,'CLINIC_NUMERIC_VALUE_INVALID');if(snapshot.scaleMin!=null&&number.lt(snapshot.scaleMin))throw new BadRequestException({code:'CLINIC_SCALE_VALUE_OUT_OF_RANGE',message:'Value below scale minimum'});if(snapshot.scaleMax!=null&&number.gt(snapshot.scaleMax))throw new BadRequestException({code:'CLINIC_SCALE_VALUE_OUT_OF_RANGE',message:'Value above scale maximum'});return {decimal:number.toString()};}
  return {value:String(value)};
 }
 async create(attentionId:string,authorId:string,input:EvaluationInput){
  if(!input.bodyAreaOrType?.trim())throw new BadRequestException({code:'CLINIC_EVALUATION_AREA_REQUIRED',message:'Body area or type is required'});
  if(!input.results?.length)throw new BadRequestException({code:'CLINIC_EVALUATION_RESULTS_REQUIRED',message:'At least one result is required'});
  return this.prisma.$transaction(async tx=>{
   if(!await tx.clinicalAttention.findUnique({where:{id:attentionId}}))throw new NotFoundException({code:'CLINIC_ATTENTION_NOT_FOUND',message:'Attention not found'});
   const evaluation=await tx.clinicalEvaluation.create({data:{attentionId,authorId,bodyAreaOrType:input.bodyAreaOrType.trim(),protocolId:input.protocolId??null,conclusion:input.conclusion?.trim()||null}});
   for(const item of input.results){
    let definition;
    if(item.inlineDefinition){this.validateDefinition(item.inlineDefinition);try{definition=await tx.clinicalTestDefinition.create({data:{name:item.inlineDefinition.name.trim(),normalizedName:this.normalize(item.inlineDefinition.name),responseType:item.inlineDefinition.responseType,unit:item.inlineDefinition.unit?.trim()||null,options:item.inlineDefinition.options??Prisma.JsonNull,scaleMin:item.inlineDefinition.scaleMin==null?null:this.decimal(item.inlineDefinition.scaleMin,'CLINIC_SCALE_INVALID'),scaleMax:item.inlineDefinition.scaleMax==null?null:this.decimal(item.inlineDefinition.scaleMax,'CLINIC_SCALE_INVALID')}});}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw new ConflictException({code:'CLINIC_CATALOG_NAME_DUPLICATE',message:'Catalog name already exists'});throw error;}}
    else if(item.testDefinitionId)definition=await tx.clinicalTestDefinition.findUnique({where:{id:item.testDefinitionId}});
    if(!definition||!definition.isSelectable)throw new BadRequestException({code:'CLINIC_TEST_NOT_SELECTABLE',message:'Test is not selectable'});
    const snapshot=this.snapshot(definition);const value=this.validateValue(definition.responseType,item.value,snapshot);
    await tx.clinicalTestResult.create({data:{evaluationId:evaluation.id,testDefinitionId:definition.id,measurementMethodId:item.measurementMethodId??null,side:item.side??null,observation:item.observation?.trim()||null,value,definitionSnapshot:snapshot}});
   }
   return tx.clinicalEvaluation.findUniqueOrThrow({where:{id:evaluation.id},include:{results:true,protocol:true,author:{select:{id:true,firstName:true,lastName:true}}}});
  });
 }
 list(attentionId:string){return this.prisma.clinicalEvaluation.findMany({where:{attentionId},orderBy:{createdAt:'desc'},include:{results:true,author:{select:{id:true,firstName:true,lastName:true}}}});}
 async detail(id:string){const result=await this.prisma.clinicalEvaluation.findUnique({where:{id},include:{results:true,protocol:true,author:{select:{id:true,firstName:true,lastName:true}}}});if(!result)throw new NotFoundException({code:'CLINIC_EVALUATION_NOT_FOUND',message:'Evaluation not found'});return result;}
 async correct(id:string,actorId:string,input:EvaluationInput){
  if(!input.results?.length)throw new BadRequestException({code:'CLINIC_EVALUATION_RESULTS_REQUIRED',message:'At least one result is required'});
  await this.detail(id);
  return this.prisma.$transaction(async tx=>{
   await tx.clinicalTestResult.deleteMany({where:{evaluationId:id}});
   await tx.clinicalEvaluation.update({where:{id},data:{bodyAreaOrType:input.bodyAreaOrType.trim(),protocolId:input.protocolId??null,conclusion:input.conclusion?.trim()||null,lastModifiedById:actorId,lastModifiedAt:new Date()}});
   for(const item of input.results){if(!item.testDefinitionId)throw new BadRequestException({code:'CLINIC_TEST_REQUIRED',message:'Test definition is required'});const definition=await tx.clinicalTestDefinition.findUnique({where:{id:item.testDefinitionId}});if(!definition)throw new BadRequestException({code:'CLINIC_TEST_NOT_FOUND',message:'Test not found'});const snapshot=this.snapshot(definition);const value=this.validateValue(definition.responseType,item.value,snapshot);await tx.clinicalTestResult.create({data:{evaluationId:id,testDefinitionId:definition.id,measurementMethodId:item.measurementMethodId??null,side:item.side??null,observation:item.observation?.trim()||null,value,definitionSnapshot:snapshot}});}
   return tx.clinicalEvaluation.findUniqueOrThrow({where:{id},include:{results:true,protocol:true,author:{select:{id:true,firstName:true,lastName:true}}}});
  });
 }
}
