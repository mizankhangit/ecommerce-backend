import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    try {
      const user = await this.usersService.create(registerDto);
      const token = this.generateToken(user);
      
      // password is excluded automatically by @Exclude() + interceptor
      return {
        user,
        access_token: token,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    // 1. Find user by email
    const user = await this.usersService.findByEmail(loginDto.email);
    
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Compare passwords
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3. Check if account is active
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // 4. Generate JWT
    const token = this.generateToken(user);

    return {
      user,
      access_token: token,
    };
  }

  private generateToken(user: User): string {
    const payload = {
      sub: user.id,       // subject (standard JWT claim)
      email: user.email,
      role: user.role,
    };

    // Sign with secret from .env (configured in AuthModule)
    return this.jwtService.sign(payload);
  }
}