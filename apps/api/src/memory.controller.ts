import {Body,Controller,Get,Inject,Param,Patch,Post,Query} from '@nestjs/common';
import {StudioService} from './studio.service';

@Controller()
export class MemoryController {
  constructor(@Inject(StudioService)private readonly studio:StudioService){}
  @Get('series/:id/localization-profile') profile(@Param('id')id:string){return this.studio.memory.profile(id);}
  @Patch('series/:id/localization-profile') updateProfile(@Param('id')id:string,@Body()input:unknown){return this.studio.memory.updateProfile(id,input);}
  @Get('series/:id/characters') characters(@Param('id')id:string,@Query()query:unknown){return this.studio.memory.characters(id,query);}
  @Post('series/:id/characters') createCharacter(@Param('id')id:string,@Body()input:unknown){return this.studio.memory.createCharacter(id,input);}
  @Patch('characters/:id') updateCharacter(@Param('id')id:string,@Body()input:unknown){return this.studio.memory.updateCharacter(id,input);}
  @Get('series/:id/relationships') relationships(@Param('id')id:string,@Query()query:unknown){return this.studio.memory.relationships(id,query);}
  @Post('series/:id/relationships') createRelationship(@Param('id')id:string,@Body()input:unknown){return this.studio.memory.createRelationship(id,input);}
  @Patch('relationships/:id') updateRelationship(@Param('id')id:string,@Body()input:unknown){return this.studio.memory.updateRelationship(id,input);}
  @Get('series/:id/glossary') glossary(@Param('id')id:string,@Query()query:unknown){return this.studio.memory.glossary(id,query);}
  @Post('series/:id/glossary') createGlossary(@Param('id')id:string,@Body()input:unknown){return this.studio.memory.createGlossary(id,input);}
  @Patch('glossary/:id') updateGlossary(@Param('id')id:string,@Body()input:unknown){return this.studio.memory.updateGlossary(id,input);}
  @Get('series/:id/translation-memory') translationMemory(@Param('id')id:string,@Query()query:unknown){return this.studio.memory.translationMemory(id,query);}
  @Post('series/:id/translation-memory') createTranslationMemory(@Param('id')id:string,@Body()input:unknown){return this.studio.memory.createTranslationMemory(id,input);}
  @Patch('translation-memory/:id') updateTranslationMemory(@Param('id')id:string,@Body()input:unknown){return this.studio.memory.updateTranslationMemory(id,input);}
}
