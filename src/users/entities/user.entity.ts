import { ApiProperty } from "@nestjs/swagger";
import { Exclude } from "class-transformer";
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from "typeorm";

export enum UserRole {
  CUSTOMER = 'customer',
  ADMIN = 'admin'
}


@Entity('users')
export class User {
  @ApiProperty({ description: 'Unique identifer', example: '550e8400-e29b-41d4-a716-446655440000' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'john@example.com' })
  @Column({ unique: true })
  @Index()
  email: string;

  @Exclude()
  @Column()
  password: string;

  @ApiProperty({ example: 'John' })
  @Column({ name: 'first_name' })
  firstName: string;

  @ApiProperty({ enum: UserRole, example: UserRole.CUSTOMER })
  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role: UserRole;

  @ApiProperty({ example: true })
  @Column({ default: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-07-28T10:00:00.000Z' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({ example: '2026-07-28T10:00:00.000Z' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

}