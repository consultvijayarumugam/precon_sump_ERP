import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetPermissionOverridesDto {
  @ApiProperty({
    description: "Tags to give this user on top of their role's tags",
    example: ['users.read'],
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  grant: string[];

  @ApiProperty({
    description: "Tags to take away from this user even if their role has them",
    example: [],
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  revoke: string[];
}
