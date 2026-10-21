import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@precon.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'your-seed-password' })
  @IsString()
  @MinLength(1)
  password: string;
}
