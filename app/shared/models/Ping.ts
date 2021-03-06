import * as S from 'sequelize-typescript'

@S.Table({tableName: 'whisper_pings'})
export default class Ping extends S.Model<Ping> {
  @S.Column({
    allowNull: false,
    primaryKey: true,
    unique: true,
    type: S.DataType.UUID,
    defaultValue: S.DataType.UUIDV4,
  })
  id: string

  @S.CreatedAt created: Date

  @S.UpdatedAt updated: Date

  @S.Column({type: S.DataType.BOOLEAN, allowNull: false, defaultValue: false})
  answered: boolean
}
